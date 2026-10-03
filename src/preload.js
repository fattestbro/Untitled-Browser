const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("untitled",{
getState:()=>ipcRenderer.invoke("state:get"),
addHistory:entry=>ipcRenderer.invoke("history:add",entry),
toggleBookmark:entry=>ipcRenderer.invoke("bookmarks:toggle",entry),
isBookmarked:url=>ipcRenderer.invoke("bookmarks:is",url),
openExternal:url=>ipcRenderer.invoke("external:open",url),
openDevTools:()=>ipcRenderer.invoke("window:devtools"),
onOpenUrl:cb=>ipcRenderer.on("open-url",(_e,url)=>cb(url)),
onDownloadFinished:cb=>ipcRenderer.on("download-finished",(_e,item)=>cb(item))
});
