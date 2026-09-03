// Data Structures
let members = JSON.parse(localStorage.getItem('fg_members')) || [];
let logs = JSON.parse(localStorage.getItem('fg_logs')) || [];

// Live Clock
function updateClock() {
    const now = new Date();
    document.getElementById('liveClock').innerText = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// Switch Tabs
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-box').forEach(sec => sec.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'attendanceTab') startBackCamera();
}

// Forced Back Camera
async function startBackCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } }
        });
        document.getElementById('webcam').srcObject = stream;
    } catch (err) {
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
            document.getElementById('webcam').srcObject = fallbackStream;
        } catch(e) {
            console.log("Camera access denied or missing");
        }
    }
}

// Save Member
function saveMember(e) {
    e.preventDefault();
    const name = document.getElementById('mName').value;
    const phone = document.getElementById('mPhone').value;
    const expiry = document.getElementById('mExpiry').value;
    const id = 'A' + (members.length + 1);

    members.push({ id, name, phone, expiry });
    localStorage.setItem('fg_members', JSON.stringify(members));
    
    alert(`Member Registered! ID: ${id}`);
    document.getElementById('addMemberForm').reset();
    renderMembers();
    updateDashboard();
}

// Render Members
function renderMembers() {
    const container = document.getElementById('membersList');
    container.innerHTML = '';

    const today = new Date().toISOString().split('T')[0];

    members.forEach(m => {
        const isExpired = m.expiry < today;
        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `
            <div class="member-info">
                <h4>${m.name} <span class="badge">${m.id}</span></h4>
                <p>Phone: ${m.phone} | Expiry: ${m.expiry}</p>
            </div>
            <div>
                <span class="${isExpired ? 'status-expired' : 'status-active'}">
                    ${isExpired ? 'EXPIRED' : 'ACTIVE'}
                </span>
                <br>
                <button class="btn-success" style="margin-top: 4px;" onclick="sendWhatsApp('${m.phone}', '${m.name}')">WhatsApp</button>
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

// Quick Attendance
function markAutoAttendance() {
    if (members.length === 0) {
        alert("Pehle kisi member ko add karein.");
        return;
    }
    const activeMember = members[0];
    const time = new Date().toLocaleTimeString();
    logs.unshift({ time, name: activeMember.name, status: 'Present' });
    localStorage.setItem('fg_logs', JSON.stringify(logs));
    
    alert(`Attendance Marked for ${activeMember.name} at ${time}`);
    renderLogs();
    updateDashboard();
}

// Render Logs
function renderLogs() {
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = '';
    logs.forEach(log => {
        tbody.innerHTML += `
            <tr>
                <td>${log.time}</td>
                <td>${log.name}</td>
                <td style="color:#2ea043; font-weight:bold;">${log.status}</td>
            </tr>
        `;
    });
}

// WhatsApp Reminder
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

    document.getElementById('totalActiveCount').innerText = activeCount;
    document.getElementById('feeOverdueCount').innerText = overdueCount;
    document.getElementById('todayAttendanceCount').innerText = logs.length;
}

// Initial Load
startBackCamera();
renderMembers();
renderLogs();
updateDashboard();
