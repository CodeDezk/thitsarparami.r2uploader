const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const prompt = require('prompt-sync')(); // Include prompt-sync for user input

// Function to determine the base directory based on the environment
const getBaseDir = () => {
  if (process.pkg) {
    // When running as an executable, use the executable's directory
    return path.dirname(process.execPath);
  } else {
    // When running in development, use the current working directory
    return process.cwd();
  }
};

// Prompt user for credentials instead of hardcoding
const USER_NAME = prompt('Enter your username: ');
const USER_PASSWORD = prompt('Enter your password: ', { echo: '*' }); // Mask password input

// Other constants
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT_URL = process.env.R2_ENDPOINT_URL;
const API_BASE_URL = process.env.API_BASE_URL;
const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;
const MEDIA_URL = process.env.MEDIA_URL;

// Function to login and retrieve AUTH_TOKEN
const logIn = async () => {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/signin`, {
      name: USER_NAME,
      pwd: USER_PASSWORD,
    });

    if (response.data) {
      console.log('✅ Login successful');
      return response.data.accessToken;
    } else {
      console.error('❌ Login failed: Please check your credentials.');
      return null;
    }
  } catch (error) {
    console.error('❌ Error during login: Unable to connect to the server.');
    return null;
  }
};

// Function to upload file to Cloudflare R2 with UUID as songId
const uploadFileToR2 = async (monkid, albumid, songId, filePath) => {
  const fileContent = fs.readFileSync(filePath);
  const fileKey = `storage/song/${monkid}/${albumid}/${songId}.mp3`;

  const s3Client = new S3Client({
    endpoint: R2_ENDPOINT_URL,
    region: 'auto',
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
    requestTimeout: 60000,  // 60 seconds timeout
  });

  const uploadParams = {
    Bucket: R2_BUCKET_NAME,
    Key: fileKey,
    Body: fileContent,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`✅ File uploaded successfully: ${fileKey}`);
    return `${MEDIA_URL}/song/${monkid}/${albumid}/${songId}.mp3`;
  } catch (err) {
    console.error(`❌ File upload failed: Unable to upload ${fileKey}. Please check your connection or storage settings.`);
    throw new Error(`File upload failed: ${err.message}`);
  }
};

// Verify Artist and Album via GraphQL
const verifyArtistAndAlbum = async (artistId, albumId, authToken) => {
  const query = `
    query Artist($where: ArtistWhereUniqueInput!, $albumsWhere2: AlbumWhereInput) {
      artist(where: $where) {
        id
        albums(where: $albumsWhere2) {
          id
        }
      }
    }
  `;

  const variables = {
    where: {
      id: artistId,
    },
    albumsWhere2: {
      id: {
        equals: albumId,
      },
    },
  };

  try {
    const response = await axios.post(GRAPHQL_ENDPOINT, { query, variables }, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-auth-type': 'JWT',
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      timeout: 30000,
    });

    if (response.data.errors || !response.data.data.artist || response.data.data.artist.albums.length === 0) {
      console.error(`❌ Could not find the artist or album for ID ${artistId}. Please verify the data.`);
      throw new Error('Artist or Album not found.');
    }

    console.log(`✅ Artist and album found for ${artistId}.`);
    return true;
  } catch (error) {
    console.error(`❌ Error finding artist or album for ID ${artistId}. Please check your input or try again later.`);
    throw error;
  }
};

// Create a new GraphQL song record
const createGraphQLRecord = async (monkid, albumid, songId, title, sort_order, file_name, duration, authToken) => {
  const query = `
    mutation CreateOneSong($data: SongCreateInput!) {
      createOneSong(data: $data) {
        id
      }
    }
  `;

  const variables = {
    data: {
      id: songId,
      title: title,
      sort_order: sort_order,
      duration: duration,
      file_name: file_name,
      artist: {
        connect: {
          id: monkid,
        },
      },
      album: {
        connect: {
          id: albumid,
        },
      },
    },
  };

  try {
    const response = await axios.post(GRAPHQL_ENDPOINT, {
      query,
      variables,
    }, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-auth-type': 'JWT',
      },
    });

    if (response.data.errors) {
      throw new Error(`GraphQL error: ${response.data.errors[0].message}`);
    }

    console.log('Song created successfully:', response.data.data.createOneSong.id);
    return response.data.data.createOneSong.id;
  } catch (error) {
    console.error('Error creating song record:', error);
    throw error;
  }
};

// Function to get the duration of the MP3 file
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      const duration = metadata.format.duration;
      resolve(duration);
    });
  });
};

// Process Excel and upload files
const processExcelFile = async (filePath, authToken) => {
  const baseDir = getBaseDir();
  const workbookPath = path.join(baseDir, 'excel', filePath);

  const workbook = XLSX.readFile(workbookPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  const totalRows = worksheet.length;
  let completedRows = 0;
  let failedRows = 0;

  const updatedData = worksheet.map(row => ({
    ...row,
    status: '', // Empty by default
    error_message: '', // Empty by default
  }));

  for (let i = 0; i < updatedData.length; i++) {
    const row = updatedData[i];
    const { monk_id, album_id, title, sort_order, file_path } = row;

    console.log(`\nℹ️ Processing song: "${title}" (${i + 1}/${totalRows})`);

    try {
      await verifyArtistAndAlbum(monk_id, album_id, authToken);

      const songId = uuidv4();
      const fullFilePathForUpload = path.join(baseDir, 'files', file_path);

      const fileUrl = await uploadFileToR2(monk_id, album_id, songId, fullFilePathForUpload);
      const duration = await getAudioDuration(fullFilePathForUpload);

      await createGraphQLRecord(monk_id, album_id, songId, title, sort_order, fileUrl, Math.round(duration), authToken);

      updatedData[i].status = 'success';
      completedRows++;
      console.log(`✅ Successfully uploaded and saved song: "${title}"`);

    } catch (error) {
      updatedData[i].status = 'error';
      updatedData[i].error_message = error.message;
      failedRows++;
      console.error(`❌ Failed to upload song: "${title}". Reason: ${error.message}`);
    }
  }

  console.log(`\n🎉 Batch processing completed: ${completedRows}/${totalRows} songs uploaded successfully.`);
  if (failedRows > 0) {
    console.log(`❗ ${failedRows} songs failed to upload. Please check the log for details.`);
  }

  // Save the log
  const logFilePath = path.join(baseDir, 'excel', 'data_log.xlsx');
  const newSheet = XLSX.utils.json_to_sheet(updatedData);
  const newWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Upload Log');
  XLSX.writeFile(newWorkbook, logFilePath);
};

// Main process to log in and handle the upload
const startProcess = async () => {
  const authToken = await logIn(); 
  if (authToken) {
    console.log('ℹ️ Starting batch file upload process...');
    await processExcelFile('data.xlsx', authToken);
    console.log('Batch processing completed.');
  } else {
    console.error('❌ Login failed. Cannot proceed with file processing.');
  }
};

startProcess().catch(err => console.error('❌ An unexpected error occurred:', err));

