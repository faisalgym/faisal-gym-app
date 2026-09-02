let members = JSON.parse(localStorage.getItem('gym_members')) || [];
let activeMember = null;
let faceMatcher = null;

window.addEventListener('DOMContentLoaded', () => {
  startClock();
  loadModels();
  renderMembersList();
  
  const today = new Date().toISOString().split('T')[0];
  const admInput = document.getElementById('admissionDate');
  const expInput = document.getElementById('expiryDate');
  if (admInput) admInput.value = today;
  if (expInput) {
    let d = new Date();
    d.setMonth(d.getMonth() + 1);
    expInput.value = d.toISOString().split('T')[0];
  }
});

function startClock() {
  setInterval(() => {
    const el = document.getElementById('liveClock');
    if (el) el.innerText = new Date().toLocaleTimeString();
  }, 1000);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  const target = document.getElementById(tabName + 'Tab');
  if (target) target.classList.add('active');
  if (window.event && window.event.currentTarget) window.event.currentTarget.classList.add('active');
}

async function loadModels() {
  try {
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'; 
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    initFaceMatcher();
    startVideo();
  } catch (err) {
    console.error("Models failed:", err);
  }
}

function startVideo() {
  const video = document.getElementById('video');
  const registerVideo = document.getElementById('registerVideo');
  const editVideo = document.getElementById('editVideo');

  navigator.mediaDevices?.getUserMedia({ video: true })
    .then(stream => {
      if (video) video.srcObject = stream;
      if (registerVideo) registerVideo.srcObject = stream;
      if (editVideo) editVideo.srcObject = stream;
    })
    .catch(err => console.error(err));
}

function generateNextMemberId() {
  if (members.length === 0) return 'A1';
  const lastId = members[members.length - 1].id;
  const num = parseInt(lastId.replace('A', '')) || members.length;
  return 'A' + (num + 1);
}

// Open Dedicated Profile Screen (Like Demo Image)
function openMemberProfile(id) {
  activeMember = members.find(m => m.id === id);
  if (!activeMember) return;

  document.getElementById('pName').innerText = activeMember.name;
  document.getElementById('pIdTag').innerText = `ID: ${activeMember.id}`;
  document.getElementById('pPhone').innerText = activeMember.phone;
  document.getElementById('pAdmissionInput').value = activeMember.admissionDate || '';
  document.getElementById('pExpiryInput').value = activeMember.expiryDate || '';

  // Phone Call & WhatsApp Links
  const cleanPhone = activeMember.phone.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;
  document.getElementById('pCallBtn').href = `tel:${activeMember.phone}`;
  document.getElementById('pWaBtn').href = `https://wa.me/${formattedPhone}`;

  // Check Overdue / Debt
  const today = new Date();
  today.setHours(0,0,0,0);
  const expiry = new Date(activeMember.expiryDate);
  expiry.setHours(0,0,0,0);

  const statusBadge = document.getElementById('pStatusBadge');
  const debtBox = document.getElementById('pDebtBox');

  if (today > expiry) {
    statusBadge.innerText = 'Expired';
    statusBadge.className = 'status-pill expired';
    
    const debtDays = activeMember.extraDaysDebt || Math.ceil((today - expiry) / (1000 * 60 * 60 * 24));
    document.getElementById('pDebtDays').innerText = debtDays;
    debtBox.style.display = 'block';
  } else {
    statusBadge.innerText = 'Active';
    statusBadge.className = 'status-pill active';
    debtBox.style.display = 'none';
  }

  document.getElementById('profileScreen').style.display = 'block';
}

function closeProfileScreen() {
  document.getElementById('profileScreen').style.display = 'none';
  closeCamForReScan();
}

function toggleEditMode() {
  const admInput = document.getElementById('pAdmissionInput');
  const expInput = document.getElementById('pExpiryInput');
  const isReadOnly = admInput.hasAttribute('readonly');

  if (isReadOnly) {
    admInput.removeAttribute('readonly');
    expInput.removeAttribute('readonly');
    alert("Field editing unlocked! You can now change dates directly.");
  } else {
    admInput.setAttribute('readonly', 'true');
    expInput.setAttribute('readonly', 'true');
  }
}

function openCamForReScan() {
  document.getElementById('reScanCamBox').style.display = 'block';
  startVideo();
}

function closeCamForReScan() {
  document.getElementById('reScanCamBox').style.display = 'none';
}

async function captureNewFaceDescriptor() {
  const editVideo = document.getElementById('editVideo');
  if (!editVideo || !activeMember) return;

  const detection = await faceapi.detectSingleFace(editVideo).withFaceLandmarks().withFaceDescriptor();
  if (!detection) {
    alert("No face detected! Please align face properly.");
    return;
  }

  activeMember.descriptor = Array.from(detection.descriptor);
  localStorage.setItem('gym_members', JSON.stringify(members));
  initFaceMatcher();
  alert(`Face photo updated successfully for ${activeMember.name}!`);
  closeCamForReScan();
}

function addMonthsToProfileExpiry(months) {
  const expInput = document.getElementById('pExpiryInput');
  let baseDate = expInput && expInput.value ? new Date(expInput.value) : new Date();
  baseDate.setMonth(baseDate.getMonth() + months);
  expInput.value = baseDate.toISOString().split('T')[0];
}

function saveFeeAndSendWhatsApp() {
  if (!activeMember) return;

  activeMember.admissionDate = document.getElementById('pAdmissionInput').value;
  activeMember.expiryDate = document.getElementById('pExpiryInput').value;
  activeMember.extraDaysDebt = 0;

  const feePaid = document.getElementById('pFeeAmount').value || '2000';
  localStorage.setItem('gym_members', JSON.stringify(members));

  const cleanPhone = activeMember.phone.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;

  const receipt = `*FAISAL GYM - FEE RECEIPT* 🏋️‍♂️\n` +
                  `*Member:* ${activeMember.name} (${activeMember.id})\n` +
                  `*Fee Paid:* Rs. ${feePaid}\n` +
                  `*New Expiry Date:* ${activeMember.expiryDate}\n` +
                  `*Status:* Paid ✅`;

  window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(receipt)}`, '_blank');
  renderMembersList();
  openMemberProfile(activeMember.id);
}

function saveProfileChangesOnly() {
  if (!activeMember) return;
  activeMember.admissionDate = document.getElementById('pAdmissionInput').value;
  activeMember.expiryDate = document.getElementById('pExpiryInput').value;

  localStorage.setItem('gym_members', JSON.stringify(members));
  alert("Profile changes saved!");
  renderMembersList();
  openMemberProfile(activeMember.id);
}

function renderMembersList(filter = '') {
  const listEl = document.getElementById('membersList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const filtered = members.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()) || m.id.toLowerCase().includes(filter.toLowerCase()));

  filtered.forEach(m => {
    const li = document.createElement('li');
    li.style.cssText = "display:flex; justify-space-between; align-items:center; padding:12px; border-bottom:1px solid #2e3646; cursor:pointer;";
    li.onclick = () => openMemberProfile(m.id);
    li.innerHTML = `
      <div>
        <strong>${m.name} (${m.id})</strong>
        <p style="margin:0; font-size:12px; color:#94a3b8;">Phone: ${m.phone} | Expiry: ${m.expiryDate}</p>
      </div>
      <span style="color:var(--primary); font-size:12px;">View Profile ❯</span>
    `;
    listEl.appendChild(li);
  });
}

async function registerMember() {
  const name = document.getElementById('memberName').value.trim();
  const phone = document.getElementById('memberPhone').value.trim();
  const admissionDate = document.getElementById('admissionDate').value;
  const expiryDate = document.getElementById('expiryDate').value;
  const video = document.getElementById('registerVideo');

  if (!name || !phone || !expiryDate) {
    alert("Please enter Name, Phone, and Expiry Date.");
    return;
  }

  const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
  if (!detection) {
    alert("No face detected!");
    return;
  }

  const newMember = {
    id: generateNextMemberId(),
    name, phone, admissionDate, expiryDate,
    extraDaysDebt: 0,
    descriptor: Array.from(detection.descriptor)
  };

  members.push(newMember);
  localStorage.setItem('gym_members', JSON.stringify(members));
  alert(`Member Registered with ID: ${newMember.id}`);
  initFaceMatcher();
  renderMembersList();
  switchTab('members');
}

function initFaceMatcher() {
  if (members.length === 0) return;
  const labeled = members.map(m => new faceapi.LabeledFaceDescriptors(`${m.id} - ${m.name}`, [new Float32Array(m.descriptor)]));
  faceMatcher = new faceapi.FaceMatcher(labeled, 0.6);
}

function handleSearch() {
  const query = document.getElementById('memberSearch').value;
  renderMembersList(query);
}
