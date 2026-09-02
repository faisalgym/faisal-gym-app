let labeledDescriptors = [];
let faceMatcher = null;
let members = JSON.parse(localStorage.getItem('gym_members')) || [];
let attendanceLogs = JSON.parse(localStorage.getItem('gym_attendance_logs')) || [];

// 1. Initial Load & Live Clock
window.addEventListener('DOMContentLoaded', () => {
  startClock();
  checkDailyReset();
  loadModels();
  updateDashboardStats();
  renderMembersList();
  renderLogs();
});

function startClock() {
  setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('liveClock');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString();
  }, 1000);
}

// 2. Navigation Tab Switcher
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  const targetTab = document.getElementById(tabName + 'Tab');
  if (targetTab) targetTab.classList.add('active');
  if (window.event && window.event.currentTarget) window.event.currentTarget.classList.add('active');
}

// 3. Model Loading & Face-API Setup (Guaranteed Direct Weights Fix)
async function loadModels() {
  const statusEl = document.getElementById('systemStatus');
  try {
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'; 
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    if (statusEl) {
      statusEl.innerText = "System Ready";
      statusEl.className = "status-badge ready";
    }
    initFaceMatcher();
    startVideo();
  } catch (err) {
    if (statusEl) {
      statusEl.innerText = "Model Load Failed";
      statusEl.className = "status-badge loading";
    }
    console.error("Model loading error:", err);
  }
}

// 4. Start Camera Stream
function startVideo() {
  const video = document.getElementById('video');
  const registerVideo = document.getElementById('registerVideo');
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: {} })
      .then(stream => {
        if (video) video.srcObject = stream;
        if (registerVideo) registerVideo.srcObject = stream;
      })
      .catch(err => console.error("Camera access error:", err));
  }
}

// 5. Auto Member ID Generator (A1, A2, A3...)
function generateNextMemberId() {
  if (members.length === 0) return 'A1';
  const lastId = members[members.length - 1].id;
  const num = parseInt(lastId.replace('A', '')) || members.length;
  return 'A' + (num + 1);
}

// 6. Member Registration
async function registerMember() {
  const nameEl = document.getElementById('memberName');
  const phoneEl = document.getElementById('memberPhone');
  const admissionEl = document.getElementById('admissionDate');
  const expiryEl = document.getElementById('expiryDate');
  const video = document.getElementById('registerVideo');

  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const admissionDate = admissionEl ? admissionEl.value : '';
  const expiryDate = expiryEl ? expiryEl.value : '';

  if (!name || !phone || !expiryDate) {
    alert('Please fill Name, Phone, and Expiry Date!');
    return;
  }

  if (!video) return;

  const detection = await faceapi.detectSingleFace(video)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    alert('No face detected! Please position face clearly in front of camera.');
    return;
  }

  const newMember = {
    id: generateNextMemberId(),
    name: name,
    phone: phone,
    admissionDate: admissionDate || new Date().toISOString().split('T')[0],
    expiryDate: expiryDate,
    descriptor: Array.from(detection.descriptor)
  };

  members.push(newMember);
  localStorage.setItem('gym_members', JSON.stringify(members));

  alert(`Member Registered Successfully! Assigned ID: ${newMember.id}`);
  if (nameEl) nameEl.value = '';
  if (phoneEl) phoneEl.value = '';

  initFaceMatcher();
  renderMembersList();
  updateDashboardStats();
  switchTab('members');
}

// 7. Initialize Face Matcher
function initFaceMatcher() {
  if (members.length === 0) return;
  labeledDescriptors = members.map(m => {
    return new faceapi.LabeledFaceDescriptors(
      `${m.id} - ${m.name}`,
      [new Float32Array(m.descriptor)]
    );
  });
  faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
}

// 8. Live Attendance Detection Engine
const videoElement = document.getElementById('video');
if (videoElement) {
  videoElement.addEventListener('play', () => {
    setInterval(async () => {
      if (!faceMatcher) return;

      const detection = await faceapi.detectSingleFace(videoElement)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const alertBox = document.getElementById('attendanceAlert');

      if (detection) {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        if (match.label !== 'unknown') {
          const memberId = match.label.split(' - ')[0];
          markAttendance(memberId, alertBox);
        } else {
          if (alertBox) {
            alertBox.innerText = "Unknown Face Detected!";
            alertBox.className = "alert-box danger";
          }
        }
      }
    }, 3000);
  });
}

// 9. Mark Attendance & Extra Days Logic
function markAttendance(memberId, alertBox) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const alreadyLogged = attendanceLogs.some(log => log.memberId === memberId && log.date === todayStr);

  const expiry = new Date(member.expiryDate);
  const today = new Date();
  today.setHours(0,0,0,0);
  expiry.setHours(0,0,0,0);

  let isExpired = false;
  let extraDays = 0;
  if (today > expiry) {
    isExpired = true;
    const diffTime = Math.abs(today - expiry);
    extraDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  if (!alreadyLogged) {
    const log = {
      memberId: member.id,
      name: member.name,
      time: new Date().toLocaleTimeString(),
      date: todayStr,
      isExpired: isExpired,
      extraDays: extraDays
    };
    attendanceLogs.unshift(log);
    localStorage.setItem('gym_attendance_logs', JSON.stringify(attendanceLogs));
    renderLogs();
    updateDashboardStats();
  }

  if (alertBox) {
    if (isExpired) {
      alertBox.innerText = `ALERT: ${member.name} (${member.id}) - FEE OVERDUE! Expired ${extraDays} Extra Days Ago.`;
      alertBox.className = "alert-box danger";
    } else {
      alertBox.innerText = `WELCOME: ${member.name} (${member.id}) - Attendance Marked!`;
      alertBox.className = "alert-box success";
    }
  }
}

// 10. Render Member List & Interactive Actions
function renderMembersList(filterQuery = '') {
  const listEl = document.getElementById('membersList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const filtered = members.filter(m => 
    m.id.toLowerCase().includes(filterQuery.toLowerCase()) ||
    m.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    listEl.innerHTML = `<li style="text-align:center; padding:15px; color:var(--text-muted);">No members found.</li>`;
    return;
  }

  filtered.forEach(m => {
    const today = new Date();
    const expiry = new Date(m.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);

    let statusHtml = `<span style="color:var(--success); font-weight:bold;">Active</span>`;
    let extraText = '';

    if (today > expiry) {
      const extraDays = Math.ceil(Math.abs(today - expiry) / (1000 * 60 * 60 * 24));
      statusHtml = `<span style="color:var(--accent-red); font-weight:bold;">Expired</span>`;
      extraText = `<br><span style="color:var(--accent-red); font-size:11px;">Overdue: ${extraDays} Extra Days</span>`;
    }

    const li = document.createElement('li');
    li.className = 'member-card-item';
    li.innerHTML = `
      <div class="member-info">
        <h4>${m.name} <span class="member-id-tag">${m.id}</span></h4>
        <p>Phone: ${m.phone} | Expiry: ${m.expiryDate} ${extraText}</p>
      </div>
      <div>
        ${statusHtml}
        <button onclick="deleteMember('${m.id}')" style="background:var(--accent-red); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; margin-left:8px; cursor:pointer;">Delete</button>
      </div>
    `;
    listEl.appendChild(li);
  });
}

// 11. Search Handler
function handleSearch() {
  const searchEl = document.getElementById('memberSearch');
  const query = searchEl ? searchEl.value : '';
  renderMembersList(query);
}

// 12. Delete Member
function deleteMember(id) {
  if (confirm(`Are you sure you want to delete member ID ${id}?`)) {
    members = members.filter(m => m.id !== id);
    localStorage.setItem('gym_members', JSON.stringify(members));
    initFaceMatcher();
    renderMembersList();
    updateDashboardStats();
  }
}

// 13. Render Today's Attendance Logs
function renderLogs() {
  const logsEl = document.getElementById('logsList');
  if (!logsEl) return;
  logsEl.innerHTML = '';

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLogs = attendanceLogs.filter(l => l.date === todayStr);

  if (todayLogs.length === 0) {
    logsEl.innerHTML = `<li style="text-align:center; padding:15px; color:var(--text-muted);">No attendance marked today yet.</li>`;
    return;
  }

  todayLogs.forEach(l => {
    const li = document.createElement('li');
    li.className = 'data-item';
    li.style.padding = '10px';
    li.style.borderBottom = '1px solid var(--border)';
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${l.name} (${l.memberId})</strong>
          <p style="font-size:11px; color:var(--text-muted);">${l.time}</p>
        </div>
        <div>
          ${l.isExpired ? `<span style="color:var(--accent-red); font-size:11px; font-weight:bold;">${l.extraDays} Extra Days!</span>` : `<span style="color:var(--success); font-size:11px;">Paid</span>`}
        </div>
      </div>
    `;
    logsEl.appendChild(li);
  });
}

// 14. Auto Daily Refresh Logic
function checkDailyReset() {
  const lastReset = localStorage.getItem('gym_last_reset');
  const todayStr = new Date().toISOString().split('T')[0];

  if (lastReset !== todayStr) {
    localStorage.setItem('gym_last_reset', todayStr);
    renderLogs();
  }
}

// 15. Dashboard Quick Analytics Stats
function updateDashboardStats() {
  const activeCountEl = document.getElementById('totalActiveMembers');
  const todayCountEl = document.getElementById('todayAttendanceCount');
  const overdueCountEl = document.getElementById('overdueCount');

  if (!activeCountEl) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date();
  today.setHours(0,0,0,0);

  let overdueCount = 0;
  members.forEach(m => {
    const expiry = new Date(m.expiryDate);
    expiry.setHours(0,0,0,0);
    if (today > expiry) overdueCount++;
  });

  const todayLogsCount = attendanceLogs.filter(l => l.date === todayStr).length;

  activeCountEl.innerText = members.length;
  todayCountEl.innerText = todayLogsCount;
  overdueCountEl.innerText = overdueCount;
}
