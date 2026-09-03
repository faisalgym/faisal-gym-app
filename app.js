/* ==========================================================================
   FAISAL GYM ENGINE - FIXED CAMERA & AUTOMATIC ID LOGIC
   ========================================================================== */

let members = JSON.parse(localStorage.getItem('fg_members')) || [];
let logs = JSON.parse(localStorage.getItem('fg_logs')) || [];
let expenses = JSON.parse(localStorage.getItem('fg_expenses')) || [];
let payments = JSON.parse(localStorage.getItem('fg_payments')) || [];
let recycledIds = JSON.parse(localStorage.getItem('fg_recycled_ids')) || [];

let activeStream = null;

// Live Clock
function updateClock() {
    const clockEl = document.getElementById('liveClock');
    if (clockEl) {
        clockEl.innerText = new Date().toLocaleTimeString();
    }
}
setInterval(updateClock, 1000);
updateClock();

// Stop any active camera stream before opening a new one
function stopCurrentStream() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

// Switch Tabs Smoothly
function switchTab(tabId, evt) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-box').forEach(sec => sec.classList.remove('active'));
    
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    } else if (evt && evt.target) {
        evt.target.classList.add('active');
    }

    const targetSec = document.getElementById(tabId);
    if (targetSec) targetSec.classList.add('active');

    // Stop existing camera to free up hardware
    stopCurrentStream();

    if (tabId === 'attendanceTab') {
        startCameraFor('webcam');
    } else if (tabId === 'addTab') {
        initAddMemberForm();
        startCameraFor('memberCam');
    }
}

// Generic Robust Camera Launcher (Handles Mobile Compatibility & Avoids Crashing)
async function startCameraFor(videoElementId) {
    const video = document.getElementById(videoElementId);
    if (!video) return;

    // Reset video UI
    video.style.display = 'block';

    const constraints = [
        { video: { facingMode: "environment" } },
        { video: { facingMode: "user" } },
        { video: true }
    ];

    for (let config of constraints) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(config);
            stopCurrentStream(); // Stop old stream
            activeStream = stream;
            video.srcObject = stream;
            await video.play();
            break; // Camera successfully started
        } catch (e) {
            console.log("Camera constraint failed, trying next...", e);
        }
    }
}

// Registration Camera Actions
function startRegistrationCamera() {
    const video = document.getElementById('memberCam');
    const previewImg = document.getElementById('capturedPreview');
    const canvas = document.getElementById('memberCanvas');
    
    if (previewImg) previewImg.style.display = 'none';
    if (canvas) canvas.style.display = 'none';
    if (video) video.style.display = 'block';

    document.getElementById('btnCapturePhoto').style.display = 'inline-block';
    document.getElementById('btnOpenRegCam').style.display = 'none';

    startCameraFor('memberCam');
}

function captureMemberPhoto() {
    const video = document.getElementById('memberCam');
    const canvas = document.getElementById('memberCanvas');
    const previewImg = document.getElementById('capturedPreview');

    if (!video || !canvas || !previewImg) return;

    // Fallback dimensions if video width not ready
    const width = video.videoWidth || 320;
    const height = video.videoHeight || 240;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, width, height);

    const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
    document.getElementById('mPhotoData').value = photoBase64;

    previewImg.src = photoBase64;
    previewImg.style.display = 'block';
    video.style.display = 'none';
    
    document.getElementById('btnCapturePhoto').style.display = 'none';
    document.getElementById('btnOpenRegCam').style.display = 'inline-block';

    stopCurrentStream();
}

// Audio Feedback (Beep)
function playAudioFeedback(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        }
    } catch(e){}
}

// Auto-ID Logic (Recycled ID Priority)
function generateAutoId() {
    if (recycledIds.length > 0) {
        recycledIds.sort((a, b) => a - b);
        const recycledNum = recycledIds[0]; // peek
        return `FG-${recycledNum}`;
    }
    let maxId = 100;
    members.forEach(m => {
        if (m.id) {
            const num = parseInt(m.id.replace('FG-', ''));
            if (!isNaN(num) && num > maxId) maxId = num;
        }
    });
    return `FG-${maxId + 1}`;
}

function autoSetExpiry() {
    const admissionInput = document.getElementById('mAdmission');
    const expiryInput = document.getElementById('mExpiry');
    if (!admissionInput || !expiryInput || !admissionInput.value) return;

    const date = new Date(admissionInput.value);
    date.setMonth(date.getMonth() + 1);
    expiryInput.value = date.toISOString().split('T')[0];
}

function initAddMemberForm() {
    const autoIdInput = document.getElementById('mAutoId');
    const admissionInput = document.getElementById('mAdmission');

    if (autoIdInput) autoIdInput.value = generateAutoId();
    if (admissionInput) {
        admissionInput.value = new Date().toISOString().split('T')[0];
        autoSetExpiry();
    }
}

// Save Member Form
function saveMember(e) {
    e.preventDefault();

    const id = document.getElementById('mAutoId').value || generateAutoId();
    const name = document.getElementById('mName').value.trim();
    const phone = document.getElementById('mPhone').value.trim();
    const admissionDate = document.getElementById('mAdmission').value;
    const expiry = document.getElementById('mExpiry').value;
    const feeAmount = parseFloat(document.getElementById('mFeeAmount').value) || 0;
    const paymentMode = document.getElementById('mPaymentMode').value;
    const photo = document.getElementById('mPhotoData').value || '';

    // If used a recycled ID, remove it from list now
    if (recycledIds.length > 0 && id === `FG-${recycledIds[0]}`) {
        recycledIds.shift();
        localStorage.setItem('fg_recycled_ids', JSON.stringify(recycledIds));
    }

    members.push({ id, name, phone, admissionDate, expiry, photo });
    localStorage.setItem('fg_members', JSON.stringify(members));

    // Payment History
    payments.push({
        id: Date.now(),
        memberId: id,
        amount: feeAmount,
        mode: paymentMode,
        date: new Date().toISOString().split('T')[0]
    });
    localStorage.setItem('fg_payments', JSON.stringify(payments));

    alert(`Member Registered Successfully!\nID: ${id}`);

    // Reset Form
    document.getElementById('addMemberForm').reset();
    document.getElementById('mPhotoData').value = '';
    
    const previewImg = document.getElementById('capturedPreview');
    if (previewImg) previewImg.style.display = 'none';

    renderMembers();
    updateDashboard();
    updateFinanceSummary();

    // Reload camera and new ID for next entry
    initAddMemberForm();
    startRegistrationCamera();
}

// Render Members List
function renderMembers() {
    const container = document.getElementById('membersList');
    if (!container) return;
    container.innerHTML = '';

    const today = new Date().toISOString().split('T')[0];

    if (members.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#8b949e; padding:15px;">No registered members found.</p>`;
        return;
    }

    members.forEach(m => {
        const isExpired = m.expiry < today;
        const card = document.createElement('div');
        card.className = 'member-card';

        const photoHtml = m.photo 
            ? `<img src="${m.photo}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 2px solid #0066FF;">`
            : `<div style="width: 45px; height: 45px; border-radius: 50%; background: #161b22; border: 1px solid #0066FF; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; color: #888;"><i class="fa-solid fa-user"></i></div>`;

        card.innerHTML = `
            <div style="display: flex; align-items: center;">
                ${photoHtml}
                <div class="member-info">
                    <h4>${m.name} <span class="badge">${m.id}</span></h4>
                    <p>Phone: ${m.phone} | Expiry: ${m.expiry}</p>
                </div>
            </div>
            <div style="text-align:right;">
                <span class="${isExpired ? 'status-expired' : 'status-active'}">
                    ${isExpired ? 'EXPIRED' : 'ACTIVE'}
                </span>
                <br>
                <button class="btn-success" style="margin-top:4px;" onclick="sendWhatsApp('${m.phone}', '${m.name}')">WhatsApp</button>
                <button class="btn-delete" onclick="deleteMember('${m.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Filter Search
function filterMembers() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const cards = document.querySelectorAll('.member-card');
    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

// Attendance Logic
function markAutoAttendance() {
    const input = document.getElementById('attendanceInput');
    const query = input.value.trim().toUpperCase();
    const alertBox = document.getElementById('attendanceAlert');

    if (members.length === 0) {
        alert("Pehle kisi member ko add karein.");
        return;
    }

    let targetMember = null;
    if (query) {
        targetMember = members.find(m => m.id === query || m.phone === query);
    } else {
        targetMember = members[0];
    }

    if (!targetMember) {
        alertBox.className = 'alert-box alert-danger';
        alertBox.innerText = 'Member Not Found!';
        alertBox.classList.remove('hidden');
        playAudioFeedback('warning');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();
    const isExpired = targetMember.expiry < today;

    logs.unshift({ time, id: targetMember.id, name: targetMember.name, status: isExpired ? 'OVERDUE' : 'Present' });
    localStorage.setItem('fg_logs', JSON.stringify(logs));

    if (isExpired) {
        alertBox.className = 'alert-box alert-danger';
        alertBox.innerHTML = `⚠️ Fee Overdue! ${targetMember.name} (${targetMember.id})`;
        playAudioFeedback('warning');
    } else {
        alertBox.className = 'alert-box alert-success';
        alertBox.innerHTML = `✅ Attendance Marked: ${targetMember.name} (${targetMember.id})`;
        playAudioFeedback('success');
    }

    alertBox.classList.remove('hidden');
    input.value = '';
    renderLogs();
    updateDashboard();
}

// Delete Member
function deleteMember(id) {
    if (!confirm(`Are you sure you want to delete ${id}? Its ID will be recycled.`)) return;

    const num = parseInt(id.replace('FG-', ''));
    if (!isNaN(num) && !recycledIds.includes(num)) {
        recycledIds.push(num);
        localStorage.setItem('fg_recycled_ids', JSON.stringify(recycledIds));
    }

    members = members.filter(m => m.id !== id);
    localStorage.setItem('fg_members', JSON.stringify(members));

    renderMembers();
    updateDashboard();
    initAddMemberForm();
}

// Expenses & Finance
function addExpense(e) {
    e.preventDefault();
    const title = document.getElementById('expTitle').value.trim();
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    const mode = document.getElementById('expMode').value;

    expenses.push({
        id: Date.now(),
        title,
        amount,
        mode,
        date: new Date().toISOString().split('T')[0]
    });
    localStorage.setItem('fg_expenses', JSON.stringify(expenses));

    document.getElementById('expenseForm').reset();
    updateFinanceSummary();
    alert('Expense Logged!');
}

function updateFinanceSummary() {
    const today = new Date().toISOString().split('T')[0];

    const todayPayments = payments.filter(p => p.date === today);
    const todayCash = todayPayments.filter(p => p.mode === 'Cash').reduce((a, b) => a + b.amount, 0);
    const todayOnline = todayPayments.filter(p => p.mode === 'Online').reduce((a, b) => a + b.amount, 0);

    const todayExp = expenses.filter(e => e.date === today).reduce((a, b) => a + b.amount, 0);
    const netProfit = (todayCash + todayOnline) - todayExp;

    const cashEl = document.getElementById('todayCash');
    const onlineEl = document.getElementById('todayOnline');
    const expEl = document.getElementById('todayExpenses');
    const profitEl = document.getElementById('todayNetProfit');

    if (cashEl) cashEl.innerText = `Rs. ${todayCash.toLocaleString()}`;
    if (onlineEl) onlineEl.innerText = `Rs. ${todayOnline.toLocaleString()}`;
    if (expEl) expEl.innerText = `Rs. ${todayExp.toLocaleString()}`;
    if (profitEl) profitEl.innerText = `Rs. ${netProfit.toLocaleString()}`;
}

// Render Attendance Logs
function renderLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    logs.forEach(log => {
        const isOverdue = log.status === 'OVERDUE';
        tbody.innerHTML += `
            <tr>
                <td>${log.time}</td>
                <td><strong>${log.id || '-'}</strong></td>
                <td>${log.name}</td>
                <td style="color:${isOverdue ? '#ff3366' : '#2ea043'}; font-weight:bold;">${log.status}</td>
            </tr>
        `;
    });
}

// WhatsApp Link
function sendWhatsApp(phone, name) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(`Dear ${name}, your Faisal Gym fee is due. Please renew to continue your training.`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
}

// Update Dashboard Numbers
function updateDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const activeCount = members.filter(m => m.expiry >= today).length;
    const overdueCount = members.filter(m => m.expiry < today).length;

    const actEl = document.getElementById('totalActiveCount');
    const overEl = document.getElementById('feeOverdueCount');
    const attEl = document.getElementById('todayAttendanceCount');

    if (actEl) actEl.innerText = activeCount;
    if (overEl) overEl.innerText = overdueCount;
    if (attEl) attEl.innerText = logs.length;
}

// Initial System Startup
window.addEventListener('DOMContentLoaded', () => {
    initAddMemberForm();
    renderMembers();
    renderLogs();
    updateDashboard();
    updateFinanceSummary();
    startCameraFor('webcam');
});
