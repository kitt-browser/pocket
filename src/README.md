#Watchpocket
Kitt extension.

## Instalation

1. Go to the extension directory and run `npm install`.
2. Run `grunt` to build the extension.
3. Copy the built extension (`dist/pocket-*.crx`) into the `exts/` folder of the Kitt dev server.
3. Load the extension in Kitt.
4. ...
5. Profit!

## Uploading to S3
Set the following env vars:

 * S3_KEY
 * S3_SECRET
 * S3_BUCKET

Then run `grunt upload`.

## Usage
Click the extension browser action to open the extension popup. If you're not signed in to Pocket you will be redirected to Pocket OAuth page. Please log in. You might see a 'There was a problem screen'. Please ignore that.

When you see a "You have successfully authenticated." screen, open the popup again. You should now see a list of your pocket bookmarks.

### Context menu
When you press and hold a link, you should see a "Add to Pocket" link. Click it to add the link to your Pocket bookmarks.
