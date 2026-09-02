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

// 4. Start Camera Streams (Back Camera Priority)
function startVideo() {
  const video = document.getElementById('video');
  const registerVideo = document.getElementById('registerVideo');
  const editVideo = document.getElementById('editVideo');

  const constraints = { 
    video: { facingMode: { exact: "environment" } } 
  };

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        if (video) video.srcObject = stream;
        if (registerVideo) registerVideo.srcObject = stream;
        if (editVideo) editVideo.srcObject = stream;
      })
      .catch(err => {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            if (video) video.srcObject = stream;
            if (registerVideo) registerVideo.srcObject = stream;
            if (editVideo) editVideo.srcObject = stream;
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

// 9. Mark Attendance & Lifetime Extra Days Debt
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

// 10. Render Member List (Clicking Member Card Opens Profile)
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

    const cleanPhone = m.phone ? m.phone.replace(/[^0-9]/g, '') : '';
    const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;

    const li = document.createElement('li');
    li.className = 'member-card-item';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '12px';
    li.style.borderBottom = '1px solid var(--border)';
    li.style.cursor = 'pointer';
    
    li.innerHTML = `
      <div class="member-info" onclick="openProfileModal('${m.id}')" style="flex-grow:1;">
        <h4 style="margin:0;">${m.name} <span class="member-id-tag">${m.id}</span></h4>
        <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">Phone: ${m.phone} | Expiry: ${m.expiryDate} ${debtText}</p>
      </div>
      <div style="text-align:right; display:flex; align-items:center; gap:6px;">
        ${statusHtml}
        <a href="https://wa.me/${formattedPhone}" target="_blank" onclick="event.stopPropagation();" style="background:#25D366; color:#fff; text-decoration:none; padding:4px 8px; border-radius:4px; font-size:12px; display:inline-block;">💬</a>
        <button onclick="event.stopPropagation(); deleteMember('${m.id}')" style="background:var(--accent-red); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Delete</button>
      </div>
    `;
    listEl.appendChild(li);
  });
}

// 11. Profile Modal Open/Close Controls
function openProfileModal(id) {
  const member = members.find(m => m.id === id);
  if (!member) return;

  document.getElementById('editMemberId').value = member.id;
  document.getElementById('editName').value = member.name;
  document.getElementById('editPhone').value = member.phone;
  document.getElementById('editAdmission').value = member.admissionDate || '';
  document.getElementById('editExpiry').value = member.expiryDate || '';

  const debtBox = document.getElementById('debtWarningBox');
  const debtDaysEl = document.getElementById('modalDebtDays');
  if (member.extraDaysDebt && member.extraDaysDebt > 0) {
    debtDaysEl.innerText = member.extraDaysDebt;
    debtBox.style.display = 'block';
  } else {
    debtBox.style.display = 'none';
  }

  document.getElementById('profileModal').style.display = 'flex';
  startVideo();
}

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

// 12. Re-Scan & Update Member Face ID Photo
async function updateMemberFacePhoto() {
  const id = document.getElementById('editMemberId').value;
  const member = members.find(m => m.id === id);
  const editVideo = document.getElementById('editVideo');

  if (!member || !editVideo) return;

  const detection = await faceapi.detectSingleFace(editVideo)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    alert("No face detected! Make sure member's face is clearly visible in the camera.");
    return;
  }

  member.descriptor = Array.from(detection.descriptor);
  localStorage.setItem('gym_members', JSON.stringify(members));
  initFaceMatcher();
  alert(`Face photo re-scanned and updated successfully for ${member.name}!`);
}

// 13. Save Profile & Send WhatsApp Receipt
function saveProfileAndSendWhatsApp() {
  const id = document.getElementById('editMemberId').value;
  const member = members.find(m => m.id === id);
  if (!member) return;

  member.name = document.getElementById('editName').value.trim();
  member.phone = document.getElementById('editPhone').value.trim();
  member.admissionDate = document.getElementById('editAdmission').value;
  member.expiryDate = document.getElementById('editExpiry').value;
  
  const feePaid = document.getElementById('editFeeAmount').value || '2000';
  member.extraDaysDebt = 0; // Clear Debt

  localStorage.setItem('gym_members', JSON.stringify(members));
  renderMembersList();
  updateDashboardStats();
  closeProfileModal();

  // WhatsApp Message Formatting
  const cleanPhone = member.phone.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;
  
  const todayStr = new Date().toLocaleDateString();
  const receiptText = `*FAISAL GYM - OFFICIAL RECEIPT* 🏋️‍♂️\n` +
                      `-----------------------------------\n` +
                      `*Member Name:* ${member.name} (${member.id})\n` +
                      `*Payment Date:* ${todayStr}\n` +
                      `*Fee Amount Paid:* Rs. ${feePaid}\n` +
                      `*New Expiry Date:* ${member.expiryDate}\n` +
                      `*Status:* Paid & Active ✅\n` +
                      `-----------------------------------\n` +
                      `_Thank you for training at Faisal Gym!_`;

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`;
  window.open(waUrl, '_blank');
}

function saveProfileOnly() {
  const id = document.getElementById('editMemberId').value;
  const member = members.find(m => m.id === id);
  if (!member) return;

  member.name = document.getElementById('editName').value.trim();
  member.phone = document.getElementById('editPhone').value.trim();
  member.admissionDate = document.getElementById('editAdmission').value;
  member.expiryDate = document.getElementById('editExpiry').value;
  member.extraDaysDebt = 0;

  localStorage.setItem('gym_members', JSON.stringify(members));
  renderMembersList();
  updateDashboardStats();
  closeProfileModal();
  alert("Member details & payment status updated successfully!");
}

// 14. Search Handler
function handleSearch() {
  const searchEl = document.getElementById('memberSearch');
  const query = searchEl ? searchEl.value : '';
  renderMembersList(query);
}

// 15. Delete Member
function deleteMember(id) {
  if (confirm(`Are you sure you want to delete member ID ${id}?`)) {
    members = members.filter(m => m.id !== id);
    localStorage.setItem('gym_members', JSON.stringify(members));
    initFaceMatcher();
    renderMembersList();
    updateDashboardStats();
  }
}

// 16. Render Today's Attendance Logs
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

// 17. Auto Daily Refresh Logic
function checkDailyReset() {
  const lastReset = localStorage.getItem('gym_last_reset');
  const todayStr = new Date().toISOString().split('T')[0];

  if (lastReset !== todayStr) {
    localStorage.setItem('gym_last_reset', todayStr);
    renderLogs();
  }
}

// 18. Dashboard Quick Analytics Stats
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
