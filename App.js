let members = JSON.parse(localStorage.getItem('fg_members')) || [];
let faceMatcher = null;

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'),
  faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'),
  faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model')
]).then(startApp);

function startApp() {
  const statusEl = document.getElementById('status-badge');
  if (statusEl) {
    statusEl.innerText = "System Ready";
    statusEl.className = "status ready";
  }
  initFaceMatcher();
  initCameras();
  renderMembers();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (event && event.target) {
    event.target.classList.add('active');
  }
}

async function initCameras() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    const attVid = document.getElementById('attendance-video');
    const regVid = document.getElementById('reg-video');
    if (attVid) attVid.srcObject = stream;
    if (regVid) regVid.srcObject = stream;
    startAttendanceScan();
  } catch (err) {
    alert("Please allow camera permissions in browser settings!");
  }
}

function initFaceMatcher() {
  const labeledDescriptors = members
    .filter(m => m.descriptor)
    .map(m => new faceapi.LabeledFaceDescriptors(m.name, [new Float32Array(m.descriptor)]));
  
  if (labeledDescriptors.length > 0) {
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
  }
}

async function captureFace() {
  const video = document.getElementById('reg-video');
  const snapStatus = document.getElementById('snap-status');
  const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
  
  if (detection) {
    document.getElementById('face-descriptor').value = JSON.stringify(Array.from(detection.descriptor));
    snapStatus.innerText = "✅ Face Captured Successfully!";
    snapStatus.style.color = "#3fb950";
  } else {
    snapStatus.innerText = "❌ No face detected. Look directly at camera.";
    snapStatus.style.color = "#da3633";
  }
}

function registerMember(e) {
  e.preventDefault();
  const descStr = document.getElementById('face-descriptor').value;
  if (!descStr) return alert("Please capture face first!");

  const newMember = {
    id: Date.now(),
    name: document.getElementById('member-name').value,
    phone: document.getElementById('member-phone').value,
    fee: document.getElementById('member-fee').value,
    status: 'Overdue',
    descriptor: JSON.parse(descStr)
  };

  members.push(newMember);
  localStorage.setItem('fg_members', JSON.stringify(members));
  initFaceMatcher();
  renderMembers();
  alert("Member Saved Successfully!");
  e.target.reset();
  document.getElementById('snap-status').innerText = "Camera ready";
}

let lastCheckIn = 0;
async function startAttendanceScan() {
  const video = document.getElementById('attendance-video');
  const alertBox = document.getElementById('attendance-result');

  setInterval(async () => {
    if (!faceMatcher || !video) return;
    
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
    if (detection) {
      const match = faceMatcher.findBestMatch(detection.descriptor);
      if (match.label !== 'unknown' && (Date.now() - lastCheckIn > 4000)) {
        lastCheckIn = Date.now();
        alertBox.className = "alert-box success";
        alertBox.innerHTML = `Welcome <strong>${match.label}</strong>!<br>Attendance Marked.`;
      }
    }
  }, 1000);
}

function renderMembers() {
  const list = document.getElementById('members-list');
  if (!list) return;
  list.innerHTML = '';
  
  let overdueCount = 0;

  members.forEach(m => {
    if (m.status === 'Overdue') overdueCount++;
    const cleanPhone = m.phone.replace(/[^0-9]/g, '');
    const waMsg = encodeURIComponent(`AoA ${m.name}, This is a friendly reminder regarding your pending fee of Rs. ${m.fee} for Faisal Gym. Please submit it at your earliest.`);
    
    list.innerHTML += `
      <li class="data-item">
        <div class="member-info">
          <h4>${m.name}</h4>
          <p>Fee: Rs.${m.fee} | Status: <span style="color:var(--danger-color)">${m.status}</span></p>
        </div>
        <a href="https://wa.me/92${cleanPhone.substring(1)}?text=${waMsg}" target="_blank" class="btn-wa">
          WhatsApp
        </a>
      </li>
    `;
  });

  const totalEl = document.getElementById('total-count');
  const overdueEl = document.getElementById('overdue-count');
  if (totalEl) totalEl.innerText = members.length;
  if (overdueEl) overdueEl.innerText = overdueCount;
}
