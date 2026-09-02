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

// 3. Model Loading & Face-API Setup
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

// 4. Start Camera Stream (Back Camera Priority)
function startVideo() {
  const video = document.getElementById('video');
  const registerVideo = document.getElementById('registerVideo');
  
  const constraints = { 
    video: { 
      facingMode: { exact: "environment" } 
    } 
  };

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        if (video) video.srcObject = stream;
        if (registerVideo) registerVideo.srcObject = stream;
      })
      .catch(err => {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            if (video) video.srcObject = stream;
            if (registerVideo) registerVideo.srcObject = stream;
          })
          .catch(e => console.error("Camera access error:", e));
      });
  }
}

// 5. Auto Member ID Generator
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
    extraDaysDebt: 0,
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

// 9. Mark Attendance & Lifetime Extra Days Debt Logic
function markAttendance(memberId, alertBox) {
  const memberIndex = members.findIndex(m => m.id === memberId);
  if (memberIndex === -1) return;
  
  const member = members[memberIndex];
  const todayStr = new Date().toISOString().split('T')[0];
  const alreadyLogged = attendanceLogs.some(log => log.memberId === memberId && log.date === todayStr);

  const expiry = new Date(member.expiryDate);
  const today = new Date();
  today.setHours(0,0,0,0);
  expiry.setHours(0,0,0,0);

  let isExpired = false;
  if (today > expiry) {
    isExpired = true;
    if (!alreadyLogged) {
      member.extraDaysDebt = (member.extraDaysDebt || 0) + 1;
      localStorage.setItem('gym_members', JSON.stringify(members));
    }
  }

  if (!alreadyLogged) {
    const log = {
      memberId: member.id,
      name: member.name,
      time: new Date().toLocaleTimeString(),
      date: todayStr,
      isExpired: isExpired,
      extraDays: member.extraDaysDebt || 0
    };
    attendanceLogs.unshift(log);
    localStorage.setItem('gym_attendance_logs', JSON.stringify(attendanceLogs));
    renderLogs();
    updateDashboardStats();
    renderMembersList();
  }

  if (alertBox) {
    if (isExpired) {
      alertBox.innerText = `ALERT: ${member.name} (${member.id}) - FEE OVERDUE! ${member.extraDaysDebt || 1} Unpaid Extra Days!`;
      alertBox.className = "alert-box danger";
    } else {
      alertBox.innerText = `WELCOME: ${member.name} (${member.id}) - Attendance Marked!`;
      alertBox.className = "alert-box success";
    }
  }
}

// 10. Render Member List with Renewal & Forgive Controls
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
    let debtText = '';

    if (m.extraDaysDebt && m.extraDaysDebt > 0) {
      debtText = `<br><span style="color:var(--accent-red); font-size:11px; font-weight:bold;">Debt: ${m.extraDaysDebt} Extra Days</span>`;
    }

    if (today > expiry) {
      statusHtml = `<span style="color:var(--accent-red); font-weight:bold;">Expired</span>`;
    }

    const li = document.createElement('li');
    li.className = 'member-card-item';
    li.style.display = 'flex';
    li.style.justifySpaceBetween = 'space-between';
    li.style.padding = '10px';
    li.style.borderBottom = '1px solid var(--border)';
    
    li.innerHTML = `
      <div class="member-info">
        <h4>${m.name} <span class="member-id-tag">${m.id}</span></h4>
        <p>Phone: ${m.phone} | Expiry: ${m.expiryDate} ${debtText}</p>
      </div>
      <div style="text-align:right;">
        ${statusHtml}<br>
        <button onclick="renewFee('${m.id}')" style="background:var(--success); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; margin-top:4px; cursor:pointer;">Renew Fee</button>
        <button onclick="deleteMember('${m.id}')" style="background:var(--accent-red); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; margin-left:4px; cursor:pointer;">Delete</button>
      </div>
    `;
    listEl.appendChild(li);
  });
}

// 11. Fee Renewal & Debt Clearance Handler
function renewFee(id) {
  const member = members.find(m => m.id === id);
  if (!member) return;

  let message = `Renew Fee for ${member.name} (${member.id})?\n`;
  if (member.extraDaysDebt && member.extraDaysDebt > 0) {
    message += `\n⚠️ Unpaid Balance: ${member.extraDaysDebt} Extra Days Worked Out.\nDo you want to CHARGE or FORGIVE these extra days?`;
  }

  const choice = confirm(message + "\n\nPress OK to Clear Debt & Renew, or Cancel to keep pending.");
  if (choice) {
    const months = prompt("Enter number of months to extend membership (e.g., 1, 3, 6):", "1");
    if (months && !isNaN(months)) {
      let baseDate = new Date();
      baseDate.setMonth(baseDate.getMonth() + parseInt(months));
      
      member.expiryDate = baseDate.toISOString().split('T')[0];
      member.extraDaysDebt = 0; // Debt Cleared
      
      localStorage.setItem('gym_members', JSON.stringify(members));
      alert(`Membership Renewed Successfully till ${member.expiryDate}! Extra days cleared.`);
      renderMembersList();
      updateDashboardStats();
    }
  }
}

// 12. Search Handler
function handleSearch() {
  const searchEl = document.getElementById('memberSearch');
  const query = searchEl ? searchEl.value : '';
  renderMembersList(query);
}

// 13. Delete Member
function deleteMember(id) {
  if (confirm(`Are you sure you want to delete member ID ${id}?`)) {
    members = members.filter(m => m.id !== id);
    localStorage.setItem('gym_members', JSON.stringify(members));
    initFaceMatcher();
    renderMembersList();
    updateDashboardStats();
  }
}

// 14. Render Today's Attendance Logs
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

// 15. Auto Daily Refresh Logic
function checkDailyReset() {
  const lastReset = localStorage.getItem('gym_last_reset');
  const todayStr = new Date().toISOString().split('T')[0];

  if (lastReset !== todayStr) {
    localStorage.setItem('gym_last_reset', todayStr);
    renderLogs();
  }
}

// 16. Dashboard Quick Analytics Stats
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
    if (today > expiry || (m.extraDaysDebt && m.extraDaysDebt > 0)) overdueCount++;
  });

  const todayLogsCount = attendanceLogs.filter(l => l.date === todayStr).length;

  activeCountEl.innerText = members.length;
  todayCountEl.innerText = todayLogsCount;
  overdueCountEl.innerText = overdueCount;
}
