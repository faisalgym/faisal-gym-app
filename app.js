// Global State Storage
let members = JSON.parse(localStorage.getItem('fg_members')) || [];
let payments = JSON.parse(localStorage.getItem('fg_payments')) || [];
let expenses = JSON.parse(localStorage.getItem('fg_expenses')) || [];
let attendanceLog = JSON.parse(localStorage.getItem('fg_attendance')) || [];

let html5QrcodeScanner = null;
let cameraStream = null;

// Clock Initialization
function initClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('digital-clock').innerText = now.toLocaleTimeString();
    document.getElementById('digital-date').innerText = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }, 1000);
}

// Tab Switching Engine
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  
  if (tabId === 'scanner-tab') {
    startBackCameraScanner();
  } else if (html5QrcodeScanner) {
    html5QrcodeScanner.clear();
  }
}

// Auto ID Recycler Logic (A-1, A-2)
function getNextRecycledID() {
  let index = 1;
  while (true) {
    let candidate = `A-${index}`;
    if (!members.some(m => m.id === candidate)) {
      return candidate;
    }
    index++;
  }
}

// Same-Date Expiry Logic
function calculateNextExpiry(startDateStr) {
  let d = new Date(startDateStr);
  let originalDay = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() !== originalDay) {
    d.setDate(0); // Adjust for shorter months
  }
  return d.toISOString().split('T')[0];
}

// Save Member
function saveMember(e) {
  e.preventDefault();
  const editId = document.getElementById('edit-member-id').value;
  const name = document.getElementById('member-name').value;
  const phone = document.getElementById('member-phone').value;
  const fee = parseFloat(document.getElementById('member-fee').value);
  const paymentMode = document.getElementById('member-payment-mode').value;
  const photo = document.getElementById('member-photo-data').value;

  const today = new Date().toISOString().split('T')[0];
  const expiry = calculateNextExpiry(today);

  if (editId) {
    let member = members.find(m => m.id === editId);
    member.name = name;
    member.phone = phone;
  } else {
    const newId = getNextRecycledID();
    const newMember = {
      id: newId,
      name,
      phone,
      fee,
      joinDate: today,
      expiryDate: expiry,
      status: 'Active',
      photo
    };
    members.push(newMember);
    payments.push({ id: newId, name, amount: fee, mode: paymentMode, timestamp: new Date().toLocaleTimeString() });
  }

  persistData();
  closeModal('member-modal');
  stopFrontCamera();
  renderAll();
}

// Render Members Grid
function renderMembers(data = members) {
  const grid = document.getElementById('members-grid');
  grid.innerHTML = '';

  data.forEach(m => {
    const isExpired = new Date(m.expiryDate) < new Date();
    const statusText = isExpired ? 'Expired' : 'Active';
    const statusClass = isExpired ? 'expired' : 'active';

    grid.innerHTML += `
      <div class="member-card" onclick="openMemberDetails('${m.id}')">
        <div class="member-header">
          <span class="member-id">${m.id}</span>
          <span class="badge ${statusClass}">${statusText}</span>
        </div>
        <h4>${m.name}</h4>
        <p style="font-size:12px; color:#94a3b8;">Exp: ${m.expiryDate}</p>
      </div>
    `;
  });
}

// Open Member Detail Modal
function openMemberDetails(id) {
  const m = members.find(item => item.id === id);
  if (!m) return;

  const isExpired = new Date(m.expiryDate) < new Date();
  const body = document.getElementById('detail-card-body');

  body.innerHTML = `
    <h2>${m.name} (${m.id})</h2>
    <p><strong>Phone:</strong> ${m.phone}</p>
    <p><strong>Joined:</strong> ${m.joinDate}</p>
    <p><strong>Fee Expiry:</strong> ${m.expiryDate}</p>
    <p><strong>Status:</strong> ${isExpired ? '<span style="color:#f43f5e">Overdue</span>' : '<span style="color:#22c55e">Active</span>'}</p>
    <hr style="margin:12px 0; border-color:rgba(255,255,255,0.1);">
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn-primary" onclick="renewFee('${m.id}')">1-Click Renew</button>
      <button class="btn-secondary" onclick="sendWhatsApp('${m.phone}', '${m.name}', '${m.expiryDate}')">WhatsApp</button>
      <button class="btn-secondary" style="border-color:#f43f5e; color:#f43f5e;" onclick="deleteMember('${m.id}')">Delete</button>
    </div>
  `;
  document.getElementById('detail-modal').style.display = 'flex';
}

// 1-Click Renew
function renewFee(id) {
  let m = members.find(item => item.id === id);
  if (m) {
    m.expiryDate = calculateNextExpiry(m.expiryDate);
    m.status = 'Active';
    payments.push({ id: m.id, name: m.name, amount: m.fee || 3000, mode: 'Cash', timestamp: new Date().toLocaleTimeString() });
    persistData();
    closeModal('detail-modal');
    renderAll();
  }
}

// Delete Member & ID Recycle
function deleteMember(id) {
  members = members.filter(m => m.id !== id);
  persistData();
  closeModal('detail-modal');
  renderAll();
}

// Scanner Engine (Back Camera)
function startBackCameraScanner() {
  if (html5QrcodeScanner) html5QrcodeScanner.clear();

  html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", {
    fps: 10,
    qrbox: 250,
    videoConstraints: { facingMode: { exact: "environment" } }
  });

  html5QrcodeScanner.render(onScanSuccess);
}

// Scan Callback & Voice Feedback
function onScanSuccess(scannedId) {
  const m = members.find(item => item.id === scannedId);
  const feedback = document.getElementById('scan-feedback');
  const todayDateStr = new Date().toISOString().split('T')[0];

  if (!m) {
    feedback.innerText = "Member Not Found!";
    feedback.style.background = "#f43f5e";
    return;
  }

  // Duplicate Check
  const alreadyScanned = attendanceLog.some(a => a.id === m.id && a.date === todayDateStr);
  if (alreadyScanned) {
    feedback.innerText = `${m.name} Already Marked Today`;
    feedback.style.background = "#eab308";
    speak("Already Marked Today");
    return;
  }

  const isExpired = new Date(m.expiryDate) < new Date();
  if (isExpired) {
    feedback.innerText = `${m.name} - Please Pay Fee!`;
    feedback.style.background = "#f43f5e";
    speak("Please Pay Fee");
  } else {
    feedback.innerText = `Welcome ${m.name} - Thank You!`;
    feedback.style.background = "#22c55e";
    speak("Thank You");
  }

  attendanceLog.unshift({ id: m.id, name: m.name, time: new Date().toLocaleTimeString(), date: todayDateStr, expired: isExpired });
  persistData();
  renderAttendanceList();
}

// Voice Synthesis
function speak(text) {
  const msg = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(msg);
}

// Camera Capture For New Member (Front Camera)
function openAddMemberModal() {
  document.getElementById('modal-title').innerText = "Add New Member";
  document.getElementById('member-form').reset();
  document.getElementById('edit-member-id').value = '';
  document.getElementById('member-modal').style.display = 'flex';

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }).then(stream => {
    cameraStream = stream;
    document.getElementById('photo-video').srcObject = stream;
  }).catch(err => console.log("Camera access error:", err));
}

function capturePhoto() {
  const video = document.getElementById('photo-video');
  const canvas = document.getElementById('photo-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  document.getElementById('member-photo-data').value = canvas.toDataURL('image/png');
  alert("Photo captured!");
}

function stopFrontCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }
}

// Expenses Logic
function saveExpense(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const category = document.getElementById('exp-category').value;
  const note = document.getElementById('exp-note').value;

  expenses.push({ amount, category, note, timestamp: new Date().toLocaleTimeString() });
  persistData();
  closeModal('expense-modal');
  renderAll();
}

// Utility Functions
function sendWhatsApp(phone, name, date) {
  const msg = `Respected ${name}, your Faisal Gym membership fee expired on ${date}. Please renew your fee. Thank you!`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  if (modalId === 'member-modal') stopFrontCamera();
}

function persistData() {
  localStorage.setItem('fg_members', JSON.stringify(members));
  localStorage.setItem('fg_payments', JSON.stringify(payments));
  localStorage.setItem('fg_expenses', JSON.stringify(expenses));
  localStorage.setItem('fg_attendance', JSON.stringify(attendanceLog));
}

function renderAll() {
  renderMembers();
  renderFinance();
  renderAttendanceList();
  updateBadges();
}

function updateBadges() {
  const activeCount = members.filter(m => new Date(m.expiryDate) >= new Date()).length;
  const pendingCount = members.length - activeCount;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = attendanceLog.filter(a => a.date === todayStr).length;

  document.getElementById('badge-active').innerText = activeCount;
  document.getElementById('badge-pending').innerText = pendingCount;
  document.getElementById('badge-attendance').innerText = todayAttendance;
}

function renderAttendanceList() {
  const list = document.getElementById('scanned-list');
  list.innerHTML = '';
  attendanceLog.slice(0, 15).forEach(item => {
    list.innerHTML += `
      <div class="scanned-item">
        <div><strong>${item.name}</strong> (${item.id})</div>
        <div style="font-size:12px; color:#94a3b8;">${item.time}</div>
      </div>
    `;
  });
}

function renderFinance() {
  let cashSum = payments.filter(p => p.mode === 'Cash').reduce((acc, curr) => acc + curr.amount, 0);
  let onlineSum = payments.filter(p => p.mode === 'Online').reduce((acc, curr) => acc + curr.amount, 0);
  let expSum = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  document.getElementById('total-cash').innerText = `Rs. ${cashSum}`;
  document.getElementById('total-online').innerText = `Rs. ${onlineSum}`;
  document.getElementById('total-expenses').innerText = `Rs. ${expSum}`;
  document.getElementById('net-profit').innerText = `Rs. ${(cashSum + onlineSum) - expSum}`;

  const payList = document.getElementById('payments-log-list');
  payList.innerHTML = '';
  payments.slice(-10).reverse().forEach(p => {
    payList.innerHTML += `
      <div class="audit-item">
        <div><strong>${p.name}</strong> (${p.id})</div>
        <div>Rs. ${p.amount} <span class="badge ${p.mode === 'Cash' ? 'active' : ''}">${p.mode}</span></div>
      </div>
    `;
  });

  const expList = document.getElementById('expenses-log-list');
  expList.innerHTML = '';
  expenses.slice(-10).reverse().forEach(e => {
    expList.innerHTML += `
      <div class="audit-item">
        <div><strong>${e.category}</strong> (${e.note || 'N/A'})</div>
        <div style="color:#f43f5e;">- Rs. ${e.amount}</div>
      </div>
    `;
  });
}

function filterMembers() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const filter = document.getElementById('status-filter').value;

  const filtered = members.filter(m => {
    const isExpired = new Date(m.expiryDate) < new Date();
    const matchesSearch = m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
    const matchesStatus = filter === 'all' || (filter === 'active' && !isExpired) || (filter === 'expired' && isExpired);
    return matchesSearch && matchesStatus;
  });

  renderMembers(filtered);
}

function openExpenseModal() {
  document.getElementById('expense-modal').style.display = 'flex';
}

// App Initialization
window.onload = () => {
  initClock();
  renderAll();
};
