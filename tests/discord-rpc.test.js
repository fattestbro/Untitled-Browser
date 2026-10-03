const test=require("node:test"),assert=require("node:assert/strict"),rpc=require("../src/discord-rpc");

test("Discord application ID is fixed",()=>assert.equal(rpc.DISCORD_APPLICATION_ID,"1555622761924272249"));
test("GitHub button is fixed in Rich Presence",()=>{
  const activity=rpc.makeActivity({details:"Browsing the web",state:"github.com"});
  assert.deepEqual(activity.buttons,[{label:"GitHub Project",url:"https://github.com/fattestbro/Untitled-Browser"}]);
});
test("RPC frame uses little-endian opcode and payload length",()=>{
  const frame=rpc.makeFrame(1,{cmd:"SET_ACTIVITY"});
  assert.equal(frame.readUInt32LE(0),1);
  assert.equal(frame.readUInt32LE(4),frame.length-8);
  assert.equal(frame.subarray(8).toString("utf8"),'{"cmd":"SET_ACTIVITY"}');
});
