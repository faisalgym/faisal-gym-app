/* ==========================================================================
   FAISAL GYM ENGINE - ALL IN ONE SINGLE INSTANT FIX
   ========================================================================== */

let members = JSON.parse(localStorage.getItem('fg_members')) || [];
let payments = JSON.parse(localStorage.getItem('fg_payments')) || [];
let recycledIds = JSON.parse(localStorage.getItem('fg_recycled_ids')) || [];
let activeStream = null;

// GUARANTEED ID GENERATOR
function generateAutoId() {
    if (recycledIds && recycledIds.length > 0) {
        recycledIds.sort((a, b) => a - b);
        return `FG-${recycledIds[0]}`;
    }
    let maxId = 100;
    if (members && members.length > 0) {
        members.forEach(m => {
            if (m && m.id) {
                const num = parseInt(m.id.replace('FG-', ''));
                if (!isNaN(num) && num > maxId) maxId = num;
            }
        });
    }
    return `FG-${maxId + 1}`;
}

// FORM INITIALIZER
function initAddMemberForm() {
    const autoIdField = document.getElementById('mAutoId');
    const admissionField = document.getElementById('mAdmission');
    const expiryField = document.getElementById('mExpiry');

    if (autoIdField) {
        autoIdField.value = generateAutoId();
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (admissionField) admissionField.value = todayStr;

    if (expiryField) {
        const expDate = new Date();
        expDate.setMonth(expDate.getMonth() + 1);
        expiryField.value = expDate.toISOString().split('T')[0];
    }
}

// STOP ALL STREAMS CLEANLY
function stopCurrentStream() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

// START CAMERA FUNCTION
async function startCameraFor(videoElementId) {
    const video = document.getElementById(videoElementId);
    if (!video) return;

    stopCurrentStream();
    video.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
        });
        activeStream = stream;
        video.srcObject = stream;
    } catch (e) {
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
            activeStream = fallbackStream;
            video.srcObject = fallbackStream;
        } catch (err) {
            console.log("Camera hardware error:", err);
        }
    }
}

// PHOTO CAPTURE LOGIC
function captureMemberPhoto() {
    const video = document.getElementById('memberCam');
    const canvas = document.getElementById('memberCanvas');
    const previewImg = document.getElementById('capturedPreview');

    if (!video || !canvas) return;

    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    
    document.getElementById('mPhotoData').value = dataUrl;

    if (previewImg) {
        previewImg.src = dataUrl;
        previewImg.style.display = 'block';
    }
    
    video.style.display = 'none';

    document.getElementById('btnCapturePhoto').style.display = 'none';
    document.getElementById('btnOpenRegCam').style.display = 'inline-block';

    stopCurrentStream();
}

function startRegistrationCamera() {
    const previewImg = document.getElementById('capturedPreview');
    if (previewImg) previewImg.style.display = 'none';

    document.getElementById('btnCapturePhoto').style.display = 'inline-block';
    document.getElementById('btnOpenRegCam').style.display = 'none';

    startCameraFor('memberCam');
}

// TAB NAVIGATION
function switchTab(tabId, evt) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-box').forEach(sec => sec.classList.remove('active'));

    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');

    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    stopCurrentStream();

    if (tabId === 'attendanceTab') {
        startCameraFor('webcam');
    } else if (tabId === 'addTab') {
        initAddMemberForm();
        startRegistrationCamera();
    } else if (tabId === 'membersTab') {
        renderMembers();
    }
}

// SAVE MEMBER FUNCTION
function saveMember(e) {
    e.preventDefault();

    const id = document.getElementById('mAutoId').value || generateAutoId();
    const name = document.getElementById('mName').value.trim();
    const phone = document.getElementById('mPhone').value.trim();
    const admissionDate = document.getElementById('mAdmission').value;
    const expiry = document.getElementById('mExpiry').value;
    const photo = document.getElementById('mPhotoData').value || '';

    if (recycledIds.length > 0 && id === `FG-${recycledIds[0]}`) {
        recycledIds.shift();
        localStorage.setItem('fg_recycled_ids', JSON.stringify(recycledIds));
    }

    members.push({ id, name, phone, admissionDate, expiry, photo });
    localStorage.setItem('fg_members', JSON.stringify(members));

    alert(`Success! Member Saved with ID: ${id}`);

    document.getElementById('addMemberForm').reset();
    document.getElementById('mPhotoData').value = '';

    initAddMemberForm();
    startRegistrationCamera();
}

// RENDER MEMBERS LIST
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
            ? `<img src="${m.photo}" style="width:45px; height:45px; border-radius:50%; object-fit:cover; margin-right:12px; border:2px solid #0066FF;">`
            : `<div style="width:45px; height:45px; border-radius:50%; background:#161b22; border:1px solid #0066FF; display:inline-flex; align-items:center; justify-content:center; margin-right:12px; color:#888;"><i class="fa-solid fa-user"></i></div>`;

        card.innerHTML = `
            <div style="display:flex; align-items:center;">
                ${photoHtml}
                <div>
                    <h4 style="font-size:14px;">${m.name} <span class="badge">${m.id}</span></h4>
                    <p style="font-size:11px; color:#8b949e;">Mob: ${m.phone} | Exp: ${m.expiry}</p>
                </div>
            </div>
            <div style="text-align:right;">
                <span class="${isExpired ? 'status-expired' : 'status-active'}">
                    ${isExpired ? 'EXPIRED' : 'ACTIVE'}
                </span>
                <br>
                <button onclick="deleteMember('${m.id}')" style="background:none; border:none; color:#da3633; font-size:11px; cursor:pointer; margin-top:5px;"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// DELETE MEMBER
function deleteMember(id) {
    if (!confirm(`Delete Member ${id}?`)) return;
    
    const num = parseInt(id.replace('FG-', ''));
    if (!isNaN(num) && !recycledIds.includes(num)) {
        recycledIds.push(num);
        localStorage.setItem('fg_recycled_ids', JSON.stringify(recycledIds));
    }

    members = members.filter(m => m.id !== id);
    localStorage.setItem('fg_members', JSON.stringify(members));
    renderMembers();
    initAddMemberForm();
}

// AUTO INIT ON LOAD
window.onload = function() {
    initAddMemberForm();
    startRegistrationCamera();
};
