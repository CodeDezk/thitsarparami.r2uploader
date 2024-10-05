# R2 Uploader

The **R2 Uploader** is a tool to batch upload MP3 files to Cloudflare R2 and register them via a GraphQL API. This guide will explain how to prepare the necessary files and execute the uploader on different operating systems.

## Directory Structure

Ensure your project has the following structure:

```bash
r2uploader/
├── excel/                     # Contains the Excel file that lists the files and metadata to upload
│   └── data.xlsx              # The Excel file with metadata
├── files/                     # Contains the actual MP3 files to upload
│   ├── 1.mp3                  # Example MP3 files
│   ├── 2.mp3
│   └── ...
├── r2uploader-macos           # The executable for macOS
├── r2uploader-linux           # The executable for Linux
├── r2uploader-win.exe         # The executable for Windows
```


## Prerequisites

- **Excel File**: Place your `data.xlsx` file in the `excel/` folder. This file should contain the metadata for each MP3 file, such as:
  - `monk_id`: The ID of the monk/artist.
  - `album_id`: The ID of the album.
  - `title`: The title of the song.
  - `sort_order`: The order in which the song should appear.
  - `file_path`: The relative file path (from the `files/` folder).

- **MP3 Files**: Place the MP3 files in the `files/` folder. The paths mentioned in `file_path` within `data.xlsx` should exactly match the names in the `files/` folder.

## How to Run

### Login Credentials

- The username and password for the uploader tool will be the **same as the Thitsarparami admin user** credentials. 

When prompted, enter your admin username and password in the command line to log in and start the upload process.


### macOS

1. **Open Terminal**.
2. **Navigate to the folder** where the `r2uploader-macos` is located.
    ```bash
    cd /path/to/r2uploader
    ```
3. **Run the executable** by entering:
    ```bash
    ./r2uploader-macos
    ```
4. **Follow the prompts** to enter your username and password. The tool will automatically start processing the Excel file and uploading the files.

### Linux

1. **Open Terminal**.
2. **Navigate to the folder** where the `r2uploader-linux` is located.
    ```bash
    cd /path/to/r2uploader
    ```
3. **Run the executable** by entering:
    ```bash
    ./r2uploader-linux
    ```
4. **Follow the prompts** to enter your username and password.

### Windows

1. **Open Command Prompt**.
2. **Navigate to the folder** where the `r2uploader-win.exe` is located:
    ```cmd
    cd \path\to\r2uploader
    ```
3. **Run the executable** by entering:
    ```cmd
    r2uploader-win.exe
    ```
4. **Follow the prompts** to enter your username and password.

## Log Output

- After processing, a summary will be displayed showing how many files were uploaded successfully and if any errors occurred.
- You will also find an `data_log.xlsx` file in the `excel/` folder, which will contain the upload status and any error messages for each row.

## Example Logs

- **Successful Upload**:
    ```
    ✅ File uploaded successfully: storage/song/monk1/album1/song1.mp3
    ✅ Successfully uploaded and saved song: "Song Title 1"
    ```

- **Error (e.g., missing artist or album)**:
    ```
    ❌ Could not find the artist or album for ID monk1. Please verify the data.
    ```


## FAQ

### What should I do if the upload fails for some files?

- Check the **error messages** shown in the terminal or `data_log.xlsx`. 
- Common issues include:
- **Missing artist/album information** in the Excel file.
- **Incorrect file paths** in the `file_path` column of the Excel file.

### Can I retry the upload?

Yes, you can retry the upload. However, please note:

- If the file has been successfully uploaded previously, uploading it again will create a **new file** with a **new ID**. 
- This means the same file will be duplicated on the server with a different unique identifier.
- To avoid duplicate uploads, make sure to verify the files before retrying the upload process.

### Can I run the tool again with new files?

Yes, just update the `data.xlsx` with new file paths and ensure the corresponding MP3 files are placed in the `files/` folder. Then rerun the tool.

## Support

If you encounter any issues or have questions, please contact [aungmo@gmail.com].
