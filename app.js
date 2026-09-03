/* ==========================================================================
   FAISAL GYM ENGINE - FULL FUNCTIONAL & ZERO ERROR LOGIC
   ========================================================================== */

let members = JSON.parse(localStorage.getItem('fg_members')) || [];
let logs = JSON.parse(localStorage.getItem('fg_logs')) || [];
let expenses = JSON.parse(localStorage.getItem('fg_expenses')) || [];
let payments = JSON.parse(localStorage.getItem('fg_payments')) || [];
let recycledIds = JSON.parse(localStorage.getItem('fg_recycled_ids')) || [];

// Live Clock
function updateClock() {
    const clockEl = document.getElementById('liveClock');
    if (clockEl) {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString();
    }
}
setInterval(updateClock, 1000);
updateClock();

// Switch Tabs (FIXED: Jab bhi Add Member Tab khulay ga, Auto-ID show ho gi)
function switchTab(tabId, evt) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-box').forEach(sec => sec.classList.remove('active'));
    
    if (evt && evt.target) {
        evt.target.classList.add('active');
    }
    
    const targetSec = document.getElementById(tabId);
    if (targetSec) targetSec.classList.add('active');

    if (tabId === 'attendanceTab') {
        startBackCamera();
    } else if (tabId === 'addTab') {
        initAddMemberForm(); // Tab kholte hi Auto ID (e.g. FG-101) dikhayega
    } else if (tabId === 'membersTab') {
        renderMembers();
    }
}

// Forced Back Camera Logic
async function startBackCamera() {
    const webcamEl = document.getElementById('webcam');
    if (!webcamEl) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } }
        });
        webcamEl.srcObject = stream;
    } catch (err) {
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" } 
            });
            webcamEl.srcObject = fallbackStream;
        } catch(e) {
            console.log("Camera access denied or missing");
        }
    }
}

// Web Audio Beep Signal
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

// Smart Auto-ID & Recycling Logic
function generateAutoId() {
    if (recycledIds && recycledIds.length > 0) {
        const sorted = [...recycledIds].sort((a, b) => a - b);
        return `FG-${sorted[0]}`;
    }
    let maxId = 100;
    members.forEach(m => {
        const num = parseInt((m.id || '').replace('FG-', ''));
        if (!isNaN(num) && num > maxId) maxId = num;
    });
    return `FG-${maxId + 1}`;
}

function autoSetExpiry() {
    const admissionEl = document.getElementById('mAdmission');
    const expiryEl = document.getElementById('mExpiry');
    if (!admissionEl || !expiryEl || !admissionEl.value) return;

    const date = new Date(admissionEl.value);
    date.setMonth(date.getMonth() + 1);
    expiryEl.value = date.toISOString().split('T')[0];
}

function initAddMemberForm() {
    const autoIdEl = document.getElementById('mAutoId');
    const admissionEl = document.getElementById('mAdmission');

    if (autoIdEl) autoIdEl.value = generateAutoId();
    if (admissionEl) {
        admissionEl.value = new Date().toISOString().split('T')[0];
        autoSetExpiry();
    }
}

// Save Member
function saveMember(e) {
    e.preventDefault();
    const autoIdEl = document.getElementById('mAutoId');
    const id = (autoIdEl && autoIdEl.value) ? autoIdEl.value : generateAutoId();
    const name = document.getElementById('mName').value.trim();
    const phone = document.getElementById('mPhone').value.trim();
    const admissionDate = document.getElementById('mAdmission').value;
    const expiry = document.getElementById('mExpiry').value;
    const feeAmount = parseFloat(document.getElementById('mFeeAmount').value) || 0;
    const paymentMode = document.getElementById('mPaymentMode').value;

    const num = parseInt(id.replace('FG-', ''));
    if (!isNaN(num) && recycledIds.includes(num)) {
        recycledIds = recycledIds.filter(i => i !== num);
        localStorage.setItem('fg_recycled_ids', JSON.stringify(recycledIds));
    }

    members.push({ id, name, phone, admissionDate, expiry });
    localStorage.setItem('fg_members', JSON.stringify(members));

    // Record Payment
    payments.push({
        id: Date.now(),
        memberId: id,
        amount: feeAmount,
        mode: paymentMode,
        date: new Date().toISOString().split('T')[0]
    });
    localStorage.setItem('fg_payments', JSON.stringify(payments));

    alert(`Member Registered Successfully! ID: ${id}`);
    document.getElementById('addMemberForm').reset();
    initAddMemberForm();
    renderMembers();
    updateDashboard();
    updateFinanceSummary();
}

// Render Members
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
        card.innerHTML = `
            <div class="member-info">
                <h4>${m.name} <span class="badge">${m.id}</span></h4>
                <p>Phone: ${m.phone} | Expiry: ${m.expiry}</p>
            </div>
            <div style="text-align:right;">
                <span class="${isExpired ? 'status-expired' : 'status-active'}">
                    ${isExpired ? 'EXPIRED' : 'ACTIVE'}
                </span>
                <br>
                <button class="btn-success" style="margin-top:4px;" onclick="sendWhatsApp('${m.phone}', '${m.name}')">WhatsApp</button>
                <button class="btn-delete" onclick="deleteMember('${m.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Filter Members
function filterMembers() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const cards = document.querySelectorAll('.member-card');
    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

// Quick Attendance & Warning Alert
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

// Delete Member & Recycle ID
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

// Finance & Expenses
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

    if (document.getElementById('todayCash')) document.getElementById('todayCash').innerText = `Rs. ${todayCash.toLocaleString()}`;
    if (document.getElementById('todayOnline')) document.getElementById('todayOnline').innerText = `Rs. ${todayOnline.toLocaleString()}`;
    if (document.getElementById('todayExpenses')) document.getElementById('todayExpenses').innerText = `Rs. ${todayExp.toLocaleString()}`;
    if (document.getElementById('todayNetProfit')) document.getElementById('todayNetProfit').innerText = `Rs. ${netProfit.toLocaleString()}`;
}

// Render Logs
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

// WhatsApp
function sendWhatsApp(phone, name) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(`Dear ${name}, your Faisal Gym fee is due. Please renew to continue your training.`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
}

// Dashboard Analytics
function updateDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const activeCount = members.filter(m => m.expiry >= today).length;
    const overdueCount = members.filter(m => m.expiry < today).length;

    if (document.getElementById('totalActiveCount')) document.getElementById('totalActiveCount').innerText = activeCount;
    if (document.getElementById('feeOverdueCount')) document.getElementById('feeOverdueCount').innerText = overdueCount;
    if (document.getElementById('todayAttendanceCount')) document.getElementById('todayAttendanceCount').innerText = logs.length;
}

// Initial Load Setup
window.addEventListener('DOMContentLoaded', () => {
    startBackCamera();
    initAddMemberForm();
    renderMembers();
    renderLogs();
    updateDashboard();
    updateFinanceSummary();
});
