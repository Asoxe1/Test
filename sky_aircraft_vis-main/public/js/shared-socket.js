// SharedWorker script to maintain a single socket.io connection across pages
// It broadcasts socket events to all connected ports (pages) and can receive commands.

let ports = [];
let socket = null;
let lastBatch = [];

function broadcast(msg){
  try{
    ports.forEach(p => p.postMessage(msg));
  }catch(e){ /* ignore */ }
}

function startSocket(){
  if (socket) return;
  try{
    // Load socket.io client inside worker
    importScripts('https://cdn.socket.io/4.6.1/socket.io.min.js');
  }catch(e){
    // If CDN fails, we cannot start the shared socket
    broadcast({type:'error', message: 'Failed to import socket.io client in SharedWorker'});
    return;
  }

  try{
    socket = io('http://localhost:8000', { transports: ['websocket','polling'] });

    socket.on('connect', () => { broadcast({type:'connect'}); });
    socket.on('disconnect', () => { broadcast({type:'disconnect'}); });
    socket.on('data:update', (d) => {
      // maintain a small recent batch to give to newly connected pages
      lastBatch.push(d);
      if (lastBatch.length > 500) lastBatch.shift();
      broadcast({type:'data:update', payload: d});
    });
    socket.on('data:batch', (arr) => {
      if (Array.isArray(arr)){
        lastBatch = lastBatch.concat(arr).slice(-500);
      }
      broadcast({type:'data:batch', payload: arr});
    });

    // optional: forward socket errors
    socket.on('error', (err) => { broadcast({type:'error', message: String(err)}); });
  }catch(e){
    broadcast({type:'error', message: 'Failed to establish socket in SharedWorker'});
  }
}

function stopSocket(){
  try{
    if (socket){
      socket.disconnect();
      socket = null;
      broadcast({type:'disconnect'});
    }
  }catch(e){ /* ignore */ }
}

onconnect = function(e){
  const port = e.ports[0];
  ports.push(port);

  port.onmessage = function(ev){
    const data = ev.data || {};
    if (data.cmd === 'start') startSocket();
    else if (data.cmd === 'stop') stopSocket();
    else if (data.cmd === 'send' && socket){
      // allow pages to send events through the shared socket if needed
      socket.emit(data.event, data.payload);
    }
  };

  // When a page connects, start socket if not running
  try{ port.postMessage({type:'connected'}); }catch(e){}
  port.start();

  // Send the lastBatch to the newly connected port so it can render immediately
  try{
    if (lastBatch && lastBatch.length) port.postMessage({type: 'data:batch', payload: lastBatch});
  }catch(e){}

  // Remove port on close
  port.onmessageerror = () => {};
  port.onclose = () => {
    ports = ports.filter(p => p !== port);
    if (ports.length === 0){
      // Optionally stop socket when no pages are connected to free resources
      // stopSocket();
    }
  };
};
