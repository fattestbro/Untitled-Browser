const {app,BrowserWindow,ipcMain,session,shell}=require("electron");
const path=require("node:path"),fs=require("node:fs");
const {normalizeUrl,safeExternalUrl}=require("./utils");
let mainWindow,state={history:[],bookmarks:[],downloads:[]};
const stateFile=()=>path.join(app.getPath("userData"),"state.json");
function loadState(){try{if(fs.existsSync(stateFile()))state={...state,...JSON.parse(fs.readFileSync(stateFile(),"utf8"))};}catch(e){console.error("[state] load failed",e.message);}}
function saveState(){try{fs.mkdirSync(path.dirname(stateFile()),{recursive:true});fs.writeFileSync(stateFile(),JSON.stringify(state,null,2));}catch(e){console.error("[state] save failed",e.message);}}
function createWindow(){mainWindow=new BrowserWindow({width:1440,height:900,minWidth:900,minHeight:600,show:false,backgroundColor:"#0b0d12",title:"Untitled Browser",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});mainWindow.loadFile(path.join(__dirname,"shell.html"));mainWindow.once("ready-to-show",()=>mainWindow.show());mainWindow.on("closed",()=>{mainWindow=null;saveState();});}
if(!app.requestSingleInstanceLock())app.quit();else{
app.on("second-instance",(_e,argv)=>{mainWindow?.show();mainWindow?.focus();const target=argv.find(x=>/^https?:\/\//i.test(x));if(target)mainWindow?.webContents.send("open-url",normalizeUrl(target));});
app.whenReady().then(()=>{loadState();
session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(new Set(["fullscreen","clipboard-read","clipboard-sanitized-write"]).has(permission)));
session.defaultSession.on("will-download",(_e,item)=>{const filePath=path.join(app.getPath("downloads"),item.getFilename());item.setSavePath(filePath);const record={name:item.getFilename(),path:filePath,started:Date.now()};state.downloads.unshift(record);item.once("done",(_e,status)=>{record.status=status;record.finished=Date.now();saveState();mainWindow?.webContents.send("download-finished",record);});});
ipcMain.handle("state:get",()=>state);
ipcMain.handle("history:add",(_e,entry)=>{if(!entry?.url||/^untitled:/.test(entry.url))return;state.history.unshift({url:entry.url,title:String(entry.title||"").slice(0,300),time:Date.now()});state.history=state.history.slice(0,1000);saveState();});
ipcMain.handle("bookmarks:toggle",(_e,entry)=>{const i=state.bookmarks.findIndex(x=>x.url===entry.url);if(i>=0)state.bookmarks.splice(i,1);else state.bookmarks.unshift({url:entry.url,title:entry.title||entry.url,time:Date.now()});saveState();return state.bookmarks;});
ipcMain.handle("bookmarks:is",(_e,url)=>state.bookmarks.some(x=>x.url===url));
ipcMain.handle("external:open",(_e,url)=>{const safe=safeExternalUrl(url);return safe?shell.openExternal(safe):false;});
ipcMain.handle("window:devtools",()=>mainWindow?.webContents.openDevTools({mode:"detach"}));
createWindow();});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
}
