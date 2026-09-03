/* ==========================================================================
   FAISAL GYM - MANAGEMENT SYSTEM ENGINE (app.js)
   Zero-Error Logic & Complete Business Rule Execution
   ========================================================================== */

// --- STATE MANAGEMENT & LOCAL STORAGE KEYS ---
const STORAGE_KEYS = {
    MEMBERS: 'faisal_gym_members',
    EXPENSES: 'faisal_gym_expenses',
    PAYMENTS: 'faisal_gym_payments',
    ATTENDANCE: 'faisal_gym_attendance',
    DELETED_IDS: 'faisal_gym_recycled_ids'
};

let members = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMBERS)) || [];
let expenses = JSON.parse(localStorage.getItem(STORAGE_KEYS.EXPENSES)) || [];
let payments = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENTS)) || [];
let attendanceLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE)) || [];
let recycledIds = JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_IDS)) || [];

let currentFilter = 'all';

// --- INITIALIZATION ON LOAD ---
document.addEventListener('DOMContentLoaded', () => {
    checkAndRecycleInactiveIds();
    renderDashboard();
    renderMemberList();
    updateFinanceSummary();
});

// --- AUDIO FEEDBACK GENERATOR (Web Audio API) ---
function playBeepSound(type = 'success') {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'success') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        } else {
            // Overdue Warning Tone
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.35);
        }
    } catch (e) {
        console.log("Audio play blocked by browser interaction rules.");
    }
}

// --- POINT 6: AUTO ID GENERATION & RECYCLING LOGIC ---
function getNextAutoId() {
    if (recycledIds.length > 0) {
        recycledIds.sort((a, b) => a - b);
        const recycledNum = recycledIds.shift();
        localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(recycledIds));
        return `FG-${recycledNum}`;
    }
    
    let maxId = 100;
    members.forEach(m => {
        const idNum = parseInt(m.autoId.replace('FG-', ''));
        if (!isNaN(idNum) && idNum > maxId) {
            maxId = idNum;
        }
    });
    return `FG-${maxId + 1}`;
}

// --- POINT 6: 3-MONTH INACTIVE AUTO ID RECYCLING CHECK ---
function checkAndRecycleInactiveIds() {
    const today = new Date();
    const activeMembers = [];

    members.forEach(m => {
        const expDate = new Date(m.expiryDate);
        const diffTime = today - expDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // If inactive for more than 90 days (3 months), release ID
        if (diffDays > 90) {
            const idNum = parseInt(m.autoId.replace('FG-', ''));
            if (!isNaN(idNum) && !recycledIds.includes(idNum)) {
                recycledIds.push(idNum);
            }
        } else {
            activeMembers.push(m);
        }
    });

    members = activeMembers;
    saveToStorage();
    localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(recycledIds));
}

// --- POINT 4: DATE EXPIRY CALCULATION ENGINE ---
function calculateExpiryDate(startDateString) {
    const date = new Date(startDateString);
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
}

function getMemberStatus(expiryDateStr) {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);
    const expiry = new Date(expiryDateStr);

    // Expired starting the very next day after expiry date
    if (today > expiry) {
        return 'OVERDUE';
    }
    return 'ACTIVE';
}

// --- POINT 8: QUICK ATTENDANCE & VOICE/VISUAL ALERT ---
function markAttendance() {
    const input = document.getElementById('attendanceInput');
    const query = input.value.trim().toUpperCase();
    const alertBox = document.getElementById('attendanceAlert');

    if (!query) return;

    const member = members.find(m => m.autoId === query || m.phone === query);

    if (!member) {
        alertBox.className = 'alert-box alert-danger';
        alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Member ID/Phone not found!`;
        alertBox.classList.remove('hidden');
        playBeepSound('warning');
        return;
    }

    const status = getMemberStatus(member.expiryDate);
    const todayStr = new Date().toISOString().split('T')[0];

    // Log attendance
    attendanceLogs.push({
        autoId: member.autoId,
        name: member.name,
        date: todayStr,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendanceLogs));

    if (status === 'ACTIVE') {
        alertBox.className = 'alert-box alert-success';
        alertBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> Attendance Marked: <strong>${member.name}</strong> (${member.autoId}) - Status: Fee Paid`;
        playBeepSound('success');
    } else {
        alertBox.className = 'alert-box alert-danger';
        alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Attendance Marked: <strong>${member.name}</strong> (${member.autoId}) - <span style="text-decoration: underline;">FEE OVERDUE!</span>`;
        playBeepSound('warning');
    }

    alertBox.classList.remove('hidden');
    input.value = '';
    renderDashboard();
    if (currentFilter === 'today') renderMemberList();
}

// --- POINT 1 & REGISTRATION: MEMBER ADDITION ---
function openAddMemberModal() {
    document.getElementById('newAutoId').value = getNextAutoId();
    document.getElementById('newAdmissionDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('addMemberModal').classList.remove('hidden');
}

function closeAddMemberModal() {
    document.getElementById('addMemberModal').classList.add('hidden');
}

function handleAddMember(e) {
    e.preventDefault();

    const autoId = document.getElementById('newAutoId').value;
    const name = document.getElementById('newName').value.trim();
    const phone = document.getElementById('newPhone').value.trim();
    const photo = document.getElementById('newPhoto').value.trim() || 'https://via.placeholder.com/150';
    const admissionDate = document.getElementById('newAdmissionDate').value;
    const feeAmount = parseFloat(document.getElementById('newFeeAmount').value);
    const paymentMode = document.getElementById('newPaymentMode').value;

    const expiryDate = calculateExpiryDate(admissionDate);

    const newMember = {
        autoId,
        name,
        phone,
        photo,
        admissionDate,
        expiryDate,
        pendingBalance: 0
    };

    const paymentRecord = {
        id: Date.now(),
        autoId,
        memberName: name,
        amount: feeAmount,
        mode: paymentMode,
        date: new Date().toISOString().split('T')[0],
        type: 'Fee Collection'
    };

    members.push(newMember);
    payments.push(paymentRecord);

    saveToStorage();
    closeAddMemberModal();
    renderDashboard();
    renderMemberList();
    updateFinanceSummary();
    document.getElementById('addMemberForm').reset();
    playBeepSound('success');
}

// --- POINT 10: EXPENSE TRACKER LOGIC ---
function openAddExpenseModal() {
    document.getElementById('addExpenseModal').classList.remove('hidden');
}

function closeAddExpenseModal() {
    document.getElementById('addExpenseModal').classList.add('hidden');
}

function handleAddExpense(e) {
    e.preventDefault();

    const title = document.getElementById('expTitle').value.trim();
    const amount = parseFloat(document.getElementById('expAmount').value);
    const mode = document.getElementById('expPaymentMode').value;

    const newExpense = {
        id: Date.now(),
        title,
        amount,
        mode,
        date: new Date().toISOString().split('T')[0]
    };

    expenses.push(newExpense);
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));

    closeAddExpenseModal();
    updateFinanceSummary();
    document.getElementById('addExpenseForm').reset();
    playBeepSound('success');
}

// --- POINT 9 & 10: FINANCIAL SUMMARY & NET PROFIT ENGINE ---
function updateFinanceSummary() {
    const todayStr = new Date().toISOString().split('T')[0];

    const todayPayments = payments.filter(p => p.date === todayStr);
    const todayCash = todayPayments.filter(p => p.mode === 'Cash').reduce((sum, p) => sum + p.amount, 0);
    const todayOnline = todayPayments.filter(p => p.mode === 'Online').reduce((sum, p) => sum + p.amount, 0);

    const todayExp = expenses.filter(e => e.date === todayStr).reduce((sum, e) => sum + e.amount, 0);
    const netProfit = (todayCash + todayOnline) - todayExp;

    document.getElementById('todayCash').innerText = `Rs. ${todayCash.toLocaleString()}`;
    document.getElementById('todayOnline').innerText = `Rs. ${todayOnline.toLocaleString()}`;
    document.getElementById('todayExpenses').innerText = `Rs. ${todayExp.toLocaleString()}`;
    document.getElementById('todayNetProfit').innerText = `Rs. ${netProfit.toLocaleString()}`;
}

// --- POINT 3: DASHBOARD CARDS & COUNTERS ---
function renderDashboard() {
    const todayStr = new Date().toISOString().split('T')[0];

    const activeCount = members.filter(m => getMemberStatus(m.expiryDate) === 'ACTIVE').length;
    const overdueCount = members.filter(m => getMemberStatus(m.expiryDate) === 'OVERDUE').length;

    const todayAttCount = attendanceLogs.filter(a => a.date === todayStr).length;

    document.getElementById('countActive').innerText = activeCount;
    document.getElementById('countToday').innerText = todayAttCount;
    document.getElementById('countOverdue').innerText = overdueCount;
}

function filterMembers(type) {
    currentFilter = type;
    const titleMap = {
        'active': 'Active Members List',
        'today': 'Members Present Today',
        'overdue': 'Fee Overdue Members',
        'all': 'All Registered Members'
    };
    document.getElementById('listTitle').innerHTML = `<i class="fa-solid fa-users"></i> ${titleMap[type]}`;
    renderMemberList();
}

function resetFilters() {
    filterMembers('all');
}

// --- RENDERING MEMBER TABLE (WITH SEARCH & SOFT DELETE) ---
function renderMemberList() {
    const tbody = document.getElementById('memberTableBody');
    tbody.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    let displayList = [...members];

    if (currentFilter === 'active') {
        displayList = displayList.filter(m => getMemberStatus(m.expiryDate) === 'ACTIVE');
    } else if (currentFilter === 'overdue') {
        displayList = displayList.filter(m => getMemberStatus(m.expiryDate) === 'OVERDUE');
    } else if (currentFilter === 'today') {
        const todayAttIds = attendanceLogs.filter(a => a.date === todayStr).map(a => a.autoId);
        displayList = displayList.filter(m => todayAttIds.includes(m.autoId));
    }

    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">No records found.</td></tr>`;
        return;
    }

    displayList.forEach(m => {
        const status = getMemberStatus(m.expiryDate);
        const badgeClass = status === 'ACTIVE' ? 'badge-active' : 'badge-overdue';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${m.autoId}</strong></td>
            <td><img src="${m.photo}" class="member-thumb" alt="Member"></td>
            <td>${m.name}</td>
            <td>${m.phone}</td>
            <td>${m.expiryDate}</td>
            <td>Rs. ${m.pendingBalance || 0}</td>
            <td><span class="badge ${badgeClass}">${status}</span></td>
            <td>
                <button class="btn btn-secondary" onclick="openProfileModal('${m.autoId}')" title="View Profile"><i class="fa-solid fa-eye"></i></button>
                <button class="btn btn-danger" onclick="softDeleteMember('${m.autoId}')" title="Delete & Release ID"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function searchMembers() {
    const q = document.getElementById('searchMember').value.toLowerCase();
    const rows = document.querySelectorAll('#memberTableBody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

// --- POINT 1 & 5: MEMBER PROFILE MODAL & BALANCE HISTORY ---
function openProfileModal(autoId) {
    const m = members.find(mem => mem.autoId === autoId);
    if (!m) return;

    const memberPayments = payments.filter(p => p.autoId === autoId);
    let payHistoryHtml = memberPayments.map(p => `
        <li style="font-size:0.85rem; color:var(--text-muted); margin-top:5px;">
            ${p.date} - Rs. ${p.amount} (${p.mode})
        </li>
    `).join('');

    const modalDetails = document.getElementById('profileDetails');
    modalDetails.innerHTML = `
        <div style="text-align: center; margin-bottom: 15px;">
            <img src="${m.photo}" style="width: 90px; height: 90px; border-radius: 50%; border: 2px solid var(--primary-blue);" alt="Profile">
            <h2 style="margin-top: 10px;">${m.name}</h2>
            <p style="color: var(--neon-blue); font-weight: 700;">ID: ${m.autoId}</p>
        </div>
        <hr style="border-color: var(--border-glass); margin-bottom: 15px;">
        <p><strong>WhatsApp:</strong> ${m.phone}</p>
        <p><strong>Admission Date:</strong> ${m.admissionDate}</p>
        <p><strong>Expiry Date:</strong> ${m.expiryDate}</p>
        <p><strong>Pending Balance / Dues:</strong> <span style="color:var(--danger); font-weight:700;">Rs. ${m.pendingBalance || 0}</span></p>
        
        <h4 style="margin-top: 15px;">Payment History</h4>
        <ul style="list-style: none; padding-left: 0;">${payHistoryHtml || '<li>No history found.</li>'}</ul>
        
        <div style="margin-top: 20px; display: flex; gap: 10px;">
            <a href="https://wa.me/${m.phone}?text=Dear%20${encodeURIComponent(m.name)},%20your%20Faisal%20Gym%20fee%20is%20due.%20Please%20pay%20your%20dues." target="_blank" class="btn btn-success btn-block" style="text-decoration:none; text-align:center;">
                <i class="fa-brands fa-whatsapp"></i> Send WhatsApp Reminder
            </a>
        </div>
    `;

    document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

// --- POINT 6: MANUAL SOFT DELETE & AUTO ID RECYCLING ---
function softDeleteMember(autoId) {
    if (!confirm(`Are you sure you want to delete ${autoId}? Its ID will be recycled for future members.`)) {
        return;
    }

    const idNum = parseInt(autoId.replace('FG-', ''));
    if (!isNaN(idNum) && !recycledIds.includes(idNum)) {
        recycledIds.push(idNum);
        localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(recycledIds));
    }

    members = members.filter(m => m.autoId !== autoId);
    saveToStorage();
    renderDashboard();
    renderMemberList();
    playBeepSound('warning');
}

// --- STORAGE SAVE HELPERS ---
function saveToStorage() {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));
}
