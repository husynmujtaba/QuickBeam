// // main.js - handles WebRTC, signaling, QR, file transfer
// const WS_URL = 'wss://YOUR_PUBLIC_SIGNALING_SERVER_URL';
// const APP_URL = '[https://quickbeam-p2p-fileshare.windsurf.build](https://quickbeam-p2p-fileshare.windsurf.build)';
// let ws, pc, dataChannel, roomId, isSender = false;

// main.js - handles WebRTC, signaling, QR, file transfer
// const WS_URL = 'wss://quickbeam-signaling.onrender.com';
// const APP_URL = '[https://quickbeam-p2p-fileshare.windsurf.build](https://quickbeam-p2p-fileshare.windsurf.build)';
const WS_URL = 'wss://quickbeam-l0jd.onrender.com';
const APP_URL = 'https://quickbeam-l0jd.onrender.com/';
let ws, pc, dataChannel, roomId, isSender = false;

// UI elements
const sendBtn = document.getElementById('sendBtn');
const receiveBtn = document.getElementById('receiveBtn');
const sendSection = document.getElementById('send-section');
const receiveSection = document.getElementById('receive-section');
const fileInput = document.getElementById('fileInput');
const roomCodeDiv = document.getElementById('roomCodeDiv');
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const sendProgressBar = document.getElementById('sendProgressBar');
const sendProgressText = document.getElementById('sendProgressText');
const sendProgressDiv = document.getElementById('send-progress');
const receiveProgressBar = document.getElementById('receiveProgressBar');
const receiveProgressText = document.getElementById('receiveProgressText');
const receiveProgressDiv = document.getElementById('receive-progress');
const qrDiv = document.getElementById('qr');
const chatSection = document.getElementById('chat-section');
const chatWindow = document.getElementById('chat-window');
const chatFileInput = document.getElementById('chatFileInput');
const attachBtn = document.getElementById('attachBtn');
const chatRoomCode = document.getElementById('chatRoomCode');
const startSection = document.getElementById('start-section');
const startRoomCode = document.getElementById('startRoomCode');
const startQR = document.getElementById('startQR');
const startChatBtn = document.getElementById('startChatBtn');
const chatTextInput = document.getElementById('chatTextInput');
const sendTextBtn = document.getElementById('sendTextBtn');
const closeSessionBtn = document.getElementById('closeSessionBtn');
let firstFilesToSend = [];

// UI event handlers
sendBtn.onclick = () => {
  isSender = true;
  startSection.style.display = '';
  receiveSection.style.display = 'none';
  chatSection.style.display = 'none';
  // Generate new room and QR each time
  initialRoomId = genRoomId();
  startRoomCode.textContent = 'Room Code: ' + initialRoomId;
  showStartQR();
};
receiveBtn.onclick = () => {
  isSender = false;
  sendSection.style.display = 'none';
  receiveSection.style.display = '';
  startSection.style.display = 'none'; // Hide the QR/start section if visible
  startRoomCode.textContent = '';
  startQR.innerHTML = '';
};
attachBtn.onclick = () => chatFileInput.click();
chatFileInput.onchange = () => {
  if (chatSection.style.display === 'none') {
    // Save for after chat starts
    firstFilesToSend = Array.from(chatFileInput.files);
  } else if (dataChannel && dataChannel.readyState === 'open') {
    sendFilesChat(Array.from(chatFileInput.files));
  }
  chatFileInput.value = '';
};

// Generate random room code
function genRoomId() {
  return Math.random().toString(36).substr(2, 8);
}

// WebRTC setup
function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ]
  });
  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({ type: 'signal', data: { candidate: e.candidate } }));
  };
  pc.ondatachannel = e => {
    dataChannel = e.channel;
    setupDataChannel(false);
  };
}

function setupDataChannel(isInitiator) {
  dataChannel.binaryType = 'arraybuffer';
  dataChannel.onopen = () => {
    // Only call sendFiles if files are already selected and this is initial open
    if (isInitiator && fileInput.files.length > 0) sendFiles();
  };
  dataChannel.onmessage = handleDataChannelMessage;
}

// File sending logic
function sendFiles() {
  const files = Array.from(fileInput.files);
  if (!files.length) return;
  let fileIndex = 0;
  const chunkSize = 64 * 1024; // 64KB
  function sendNextFile() {
    if (fileIndex >= files.length) {
      sendProgressBar.value = 100;
      sendProgressText.textContent = 'All files sent!';
      return;
    }
    let file = files[fileIndex];
    let offset = 0;
    sendProgressDiv.style.display = '';
    sendProgressBar.value = 0;
    sendProgressText.textContent = `0% (${file.name})`;
    let startTime = Date.now();
    let lastTime = startTime;
    let lastOffset = 0;
    // Send file metadata
    dataChannel.send(JSON.stringify({ name: file.name, size: file.size, type: file.type, idx: fileIndex + 1, total: files.length }));
    const reader = new FileReader();
    reader.onload = e => {
      let buffer = e.target.result;
      function sendChunk() {
        while (offset < buffer.byteLength) {
          if (dataChannel.bufferedAmount > 512 * 1024) {
            setTimeout(sendChunk, 10);
            return;
          }
          let chunk = buffer.slice(offset, offset + chunkSize);
          dataChannel.send(chunk);
          offset += chunkSize;
          let percent = Math.floor((offset / buffer.byteLength) * 100);
          // Calculate speed
          let now = Date.now();
          let elapsed = (now - lastTime) / 1000;
          let speed = '';
          if (elapsed > 0.5) {
            let bytesSent = offset - lastOffset;
            let bps = bytesSent / elapsed;
            speed = bps > 1024 * 1024 ? `${(bps / (1024 * 1024)).toFixed(2)} MB/s` : `${(bps / 1024).toFixed(2)} KB/s`;
            lastTime = now;
            lastOffset = offset;
          }
          sendProgressBar.value = percent;
          sendProgressText.textContent = `${percent}% (${file.name})${speed ? ' - ' + speed : ''}`;
        }
        if (offset >= buffer.byteLength) {
          fileIndex++;
          sendNextFile();
        }
      }
      sendChunk();
    };
    reader.readAsArrayBuffer(file);
  }
  sendNextFile();
}

// File receiving logic
let incomingFileInfo, incomingFileBuffer = [], incomingFileReceived = 0, incomingBubble = null;
function handleDataChannelMessage(e) {
  if (typeof e.data === 'string') {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'text') {
        addChatBubble({ text: msg.text, sent: false, type: 'text' });
        return;
      }
      incomingFileInfo = msg;
      incomingFileBuffer = [];
      incomingFileReceived = 0;
      if (incomingFileInfo.chat) {
        incomingBubble = addChatBubble({name: incomingFileInfo.name, type: incomingFileInfo.type, progress: 0, sent: false, done: false});
      } else {
        receiveProgressDiv.style.display = '';
        receiveProgressBar.value = 0;
        receiveProgressText.textContent = `0% (${incomingFileInfo.name})`;
      }
    } catch {}
  } else {
    incomingFileBuffer.push(e.data);
    incomingFileReceived += e.data.byteLength;
    let percent = Math.floor((incomingFileReceived / incomingFileInfo.size) * 100);
    if (incomingFileInfo.chat && incomingBubble) {
      incomingBubble.querySelector('progress').value = percent;
    } else {
      receiveProgressBar.value = percent;
      receiveProgressText.textContent = `${percent}% (${incomingFileInfo.name})`;
    }
    if (incomingFileReceived >= incomingFileInfo.size) {
      let blob = new Blob(incomingFileBuffer, { type: incomingFileInfo.type });
      let url = URL.createObjectURL(blob);
      if (!incomingBubble) {
        incomingBubble = addChatBubble({name: incomingFileInfo.name, type: incomingFileInfo.type, progress: 100, sent: false, done: false});
      }
      if (incomingBubble.querySelector('progress')) incomingBubble.querySelector('progress').remove();
      const a = document.createElement('a');
      a.className = 'bubble-download';
      a.href = url;
      a.download = incomingFileInfo.name;
      a.textContent = 'Download';
      incomingBubble.appendChild(a);
      incomingBubble = null;
      receiveProgressDiv.style.display = 'none';
    }
  }
}

// Chat UI logic
function addChatBubble({ name, type, progress, sent, done, text }) {
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble' + (sent ? '' : ' received');
  if (type === 'text' || text) {
    // Detect link (http/https)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (text && urlRegex.test(text)) {
      // If message is a link, make it clickable
      bubble.innerHTML = text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" rel="noopener" class="bubble-link">${url}</a>`;
      });
    } else {
      // Plain text: add copy button
      const span = document.createElement('span');
      span.textContent = text;
      bubble.appendChild(span);
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.title = 'Copy text';
      copyBtn.textContent = '📋';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(text);
        copyBtn.textContent = '✅';
        setTimeout(() => copyBtn.textContent = '📋', 1200);
      };
      bubble.appendChild(copyBtn);
    }
    chatWindow.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return bubble;
  }
  if (name) {
    const fileName = document.createElement('div');
    fileName.className = 'bubble-filename';
    fileName.textContent = name;
    bubble.appendChild(fileName);
  }
  if (progress !== undefined && !done) {
    const prog = document.createElement('progress');
    prog.max = 100;
    prog.value = progress || 0;
    bubble.appendChild(prog);
  }
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

// Chat-based file sending
function sendFilesChat(files) {
  let fileIndex = 0;
  const chunkSize = 64 * 1024; // 64KB
  function sendNextFile() {
    if (fileIndex >= files.length) return;
    let file = files[fileIndex];
    let offset = 0;
    let startTime = Date.now();
    let lastTime = startTime;
    let lastOffset = 0;
    let bubble = addChatBubble({name: file.name, type: file.type, progress: 0, sent: true, done: false});
    // Send file metadata
    dataChannel.send(JSON.stringify({ name: file.name, size: file.size, type: file.type, idx: fileIndex + 1, total: files.length, chat: true }));
    const reader = new FileReader();
    reader.onload = e => {
      let buffer = e.target.result;
      function sendChunk() {
        while (offset < buffer.byteLength) {
          if (dataChannel.bufferedAmount > 512 * 1024) {
            setTimeout(sendChunk, 10);
            return;
          }
          let chunk = buffer.slice(offset, offset + chunkSize);
          dataChannel.send(chunk);
          offset += chunkSize;
          let percent = Math.floor((offset / buffer.byteLength) * 100);
          // Calculate speed
          let now = Date.now();
          let elapsed = (now - lastTime) / 1000;
          let speed = '';
          if (elapsed > 0.5) {
            let bytesSent = offset - lastOffset;
            let bps = bytesSent / elapsed;
            speed = bps > 1024 * 1024 ? `${(bps / (1024 * 1024)).toFixed(2)} MB/s` : `${(bps / 1024).toFixed(2)} KB/s`;
            lastTime = now;
            lastOffset = offset;
          }
          if (bubble.querySelector('progress')) bubble.querySelector('progress').value = percent;
          if (bubble.querySelector('progress')) bubble.querySelector('progress').nextSibling && (bubble.querySelector('progress').nextSibling.textContent = speed ? ` - ${speed}` : '');
          else if (speed) bubble.appendChild(document.createTextNode(` - ${speed}`));
        }
        if (offset >= buffer.byteLength) {
          if (bubble.querySelector('progress')) bubble.querySelector('progress').remove();
          bubble.appendChild(document.createTextNode('Sent!'));
          fileIndex++;
          sendNextFile();
        }
      }
      sendChunk();
    };
    reader.readAsArrayBuffer(file);
  }
  sendNextFile();
}

// Send text message
function sendTextMessage() {
  const msg = chatTextInput.value.trim();
  if (!msg || !dataChannel || dataChannel.readyState !== 'open') return;
  // Show in chat as sender
  addChatBubble({ text: msg, sent: true, type: 'text' });
  // Send as JSON
  dataChannel.send(JSON.stringify({ type: 'text', text: msg }));
  chatTextInput.value = '';
}
sendTextBtn.onclick = sendTextMessage;
chatTextInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendTextMessage();
  }
});

// Signaling logic
function connectWebSocket() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room: roomId }));
  };
  ws.onmessage = async (event) => {
    let msg = JSON.parse(event.data);
    if (msg.type === 'ready') {
      if (isSender) {
        dataChannel = pc.createDataChannel('file');
        setupDataChannel(true);
        let offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'signal', data: { sdp: pc.localDescription } }));
      }
    } else if (msg.type === 'signal') {
      if (msg.data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
        if (!isSender) {
          let answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'signal', data: { sdp: pc.localDescription } }));
        }
      }
      if (msg.data.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(msg.data.candidate)); } catch {}
      }
    }
  };
}

// QR code helper
function showQR(room) {
  qrDiv.innerHTML = '';
  const url = `${APP_URL}/?room=${room}`;
  const qr = new QRious({
    element: document.createElement('canvas'),
    value: url,
    size: 200
  });
  qrDiv.appendChild(qr.element);
  const link = document.createElement('div');
  link.style.marginTop = '10px';
  link.style.fontSize = '0.95em';
  link.textContent = url;
  qrDiv.appendChild(link);
}

// Show chat UI after pairing
function showChatUI(room) {
  chatSection.style.display = '';
  sendSection.style.display = 'none';
  receiveSection.style.display = 'none';
  chatRoomCode.textContent = 'Room: ' + room;
  setCloseSessionVisible(true);
}

// --- Start session UI logic ---
let initialRoomId;
function showStartQR() {
  startQR.innerHTML = '';
  const url = `${APP_URL}/?room=${initialRoomId}`;
  const qr = new QRious({
    element: document.createElement('canvas'),
    value: url,
    size: 200
  });
  startQR.appendChild(qr.element);
  const link = document.createElement('div');
  link.style.marginTop = '10px';
  link.style.fontSize = '0.95em';
  link.textContent = url;
  startQR.appendChild(link);
  setCloseSessionVisible(true);
}

startChatBtn.onclick = () => {
  // Hide start, show chat
  startSection.style.display = 'none';
  chatSection.style.display = '';
  chatRoomCode.textContent = 'Room: ' + initialRoomId;
  // Set up connection
  roomId = initialRoomId;
  createPeerConnection();
  connectWebSocket();
  // If files were selected before chat, send them
  setTimeout(() => {
    if (firstFilesToSend.length && dataChannel && dataChannel.readyState === 'open') {
      sendFilesChat(firstFilesToSend);
      firstFilesToSend = [];
    }
  }, 1200);
};

// --- Modify pairing logic to use start-section for sender ---
fileInput.onchange = () => {
  // Deprecated: hide legacy send-section
};

// --- Show chat UI after pairing for receiver ---
joinRoomBtn.onclick = () => {
  roomId = roomInput.value.trim();
  if (!roomId) return alert('Enter room code!');
  createPeerConnection();
  connectWebSocket();
  setTimeout(() => showChatUI(roomId), 1500);
};

// --- Auto-switch to receive if room param in URL ---
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    isSender = false;
    startSection.style.display = 'none';
    sendSection.style.display = 'none';
    receiveSection.style.display = 'none';
    chatSection.style.display = '';
    roomId = room;
    chatRoomCode.textContent = 'Room: ' + room;
    createPeerConnection();
    connectWebSocket();
  } else {
    // Default: hide start-section, show mode-select
    startSection.style.display = 'none';
    sendSection.style.display = 'none';
    receiveSection.style.display = 'none';
    chatSection.style.display = 'none';
  }
});

// Utility to show/hide Close Session button
function setCloseSessionVisible(visible) {
  closeSessionBtn.style.display = visible ? '' : 'none';
}

// --- Drag and drop file support for chat window ---
chatWindow.addEventListener('dragover', (e) => {
  e.preventDefault();
  chatWindow.classList.add('dragover');
});
chatWindow.addEventListener('dragleave', (e) => {
  e.preventDefault();
  chatWindow.classList.remove('dragover');
});
chatWindow.addEventListener('drop', (e) => {
  e.preventDefault();
  chatWindow.classList.remove('dragover');
  if (dataChannel && dataChannel.readyState === 'open' && e.dataTransfer.files.length) {
    sendFilesChat(Array.from(e.dataTransfer.files));
  }
});

// --- Close Session logic ---
closeSessionBtn.style.display = 'none';
document.getElementById('closeSessionBtn').onclick = function() {
  if (confirm('Are you sure you want to close the session? This will disconnect you from the room and reload the page.')) {
    try {
      if (dataChannel) dataChannel.close();
    } catch {}
    try {
      if (pc) pc.close();
    } catch {}
    try {
      if (ws) ws.close();
    } catch {}
    setCloseSessionVisible(false);
    location.reload();
  }
};
