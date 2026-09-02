const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

let labeledDescriptors = [];
let faceMatcher;
let tempDescriptor = null;
let lastScanTime = 0; // Prevent spam sounds

const statusBadge = document.getElementById('statusBadge');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const alertBox = document.getElementById('alertBox');

// Audio Effects (Web Audio API)
function playSound(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
        // High Success Beep
        osc.frequency.setValueAtTime(880, ctx.currentTime); 
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'warning') {
        // Low Warning Tone for Expiry
        osc.frequency.setValueAtTime(300, ctx.currentTime); 
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    }
}

async function loadModels() {
    try {
        if(statusBadge) statusBadge.textContent = 'Loading Models...';
        
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

        if(statusBadge) {
            statusBadge.textContent = 'System Ready';
            statusBadge.className = 'badge ready';
        }
        
        startVideo();
        loadMembers();
    } catch (err) {
        console.error(err);
        if(statusBadge) {
            statusBadge.textContent = 'Error Loading Models';
            statusBadge.className = 'badge danger';
        }
    }
}

// Force Back Camera (facingMode: environment)
async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: { exact: "environment" } } 
        });
        if(video) video.srcObject = stream;
    } catch (err) {
        // Fallback to default camera if exact back camera fails
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            if(video) video.srcObject = fallbackStream;
        } catch(e) {
            if(alertBox) {
                alertBox.textContent = 'Camera access denied or unavailable.';
                alertBox.className = 'alert-box';
            }
        }
    }
}

function showTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    const targetTab = document.getElementById(tabId);
    if(targetTab) targetTab.classList.add('active');
}

function setupAutoDates() {
    const today = new Date();
    const joinInput = document.getElementById('memberJoinDate');
    const expiryInput = document.getElementById('memberExpiryDate');

    if (joinInput && expiryInput) {
        joinInput.value = today.toISOString().split('T')[0];
        const expiryDate = new Date(today);
        expiryDate.setMonth(expiryDate.getMonth() + 1);
        expiryInput.value = expiryDate.toISOString().split('T')[0];
    }
}

document.getElementById('memberJoinDate')?.addEventListener('change', (e) => {
    const selectedDate = new Date(e.target.value);
    if (!isNaN(selectedDate)) {
        selectedDate.setMonth(selectedDate.getMonth() + 1);
        document.getElementById('memberExpiryDate').value = selectedDate.toISOString().split('T')[0];
    }
});

function getStoredMembers() {
    return JSON.parse(localStorage.getItem('faisal_gym_members')) || [];
}

function saveStoredMembers(members) {
    localStorage.setItem('faisal_gym_members', JSON.stringify(members));
}

function loadMembers() {
    const members = getStoredMembers();
    const totalElem = document.getElementById('totalMembers');
    if(totalElem) totalElem.textContent = members.length;
    
    const list = document.getElementById('membersList');
    if(list) {
        list.innerHTML = '';
        members.forEach(m => {
            const li = document.createElement('li');
            li.className = 'member-item';
            li.innerHTML = `
                <div class="member-info">
                    <h4>${m.name}</h4>
                    <p>Phone: ${m.phone} | Fee: PKR ${m.fee}</p>
                    <p><small>Joined: ${m.joinDate || 'N/A'} | Expiry: ${m.expiryDate || 'N/A'}</small></p>
                </div>
                <span style="color: #22c55e;">Registered</span>
            `;
            list.appendChild(li);
        });
    }

    updateFaceMatcher(members);
}

async function updateFaceMatcher(members) {
    if (members.length === 0) return;

    const labeled = [];
    for (const m of members) {
        if (m.descriptor) {
            const Float32Desc = new Float32Array(Object.values(m.descriptor));
            labeled.push(new faceapi.LabeledFaceDescriptors(m.name, [Float32Desc]));
        }
    }

    if (labeled.length > 0) {
        faceMatcher = new faceapi.FaceMatcher(labeled, 0.6);
    }
}

async function captureSnapshot() {
    const statusText = document.getElementById('captureStatus');
    if(statusText) statusText.textContent = 'Detecting Face...';

    if(!video || !video.srcObject) {
        if(statusText) {
            statusText.textContent = 'Camera not ready.';
            statusText.style.color = '#ef4444';
        }
        return;
    }

    const detection = await faceapi.detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (detection) {
        tempDescriptor = detection.descriptor;
        if(statusText) {
            statusText.textContent = 'Face Captured Successfully!';
            statusText.style.color = '#22c55e';
        }
        playSound('success');
    } else {
        if(statusText) {
            statusText.textContent = 'No face detected. Align face clearly.';
            statusText.style.color = '#ef4444';
        }
    }
}

document.getElementById('addMemberForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!tempDescriptor) {
        alert('Please capture reference face first.');
        return;
    }

    const name = document.getElementById('memberName').value;
    const phone = document.getElementById('memberPhone').value;
    const fee = document.getElementById('memberFee').value;
    const joinDate = document.getElementById('memberJoinDate').value;
    const expiryDate = document.getElementById('memberExpiryDate').value;

    const members = getStoredMembers();
    members.push({ name, phone, fee, joinDate, expiryDate, descriptor: tempDescriptor });
    saveStoredMembers(members);

    alert(`Member ${name} added!\nExpiry Date: ${expiryDate}`);
    document.getElementById('addMemberForm').reset();
    
    setupAutoDates();
    const statusText = document.getElementById('captureStatus');
    if(statusText) statusText.textContent = '';
    tempDescriptor = null;
    loadMembers();
});

function recordAttendance(memberName) {
    const logs = JSON.parse(localStorage.getItem('faisal_gym_attendance_logs')) || [];
    const now = new Date();
    const todayStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    const alreadyMarked = logs.some(log => log.name === memberName && log.date === todayStr);

    if (!alreadyMarked) {
        logs.push({ name: memberName, date: todayStr, time: timeStr });
        localStorage.setItem('faisal_gym_attendance_logs', JSON.stringify(logs));
    }
}

// Live Face Scanner Loop with Sound & Fee Expiry Check
video?.addEventListener('play', () => {
    const displaySize = { width: video.width || 320, height: video.height || 240 };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (!faceMatcher) return;

        const detections = await faceapi.detectAllFaces(video)
            .withFaceLandmarks()
            .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        const members = getStoredMembers();
        const todayStr = new Date().toISOString().split('T')[0];

        resizedDetections.forEach(detection => {
            const result = faceMatcher.findBestMatch(detection.descriptor);
            const box = detection.detection.box;

            if (result.label !== 'unknown') {
                const memberData = members.find(m => m.name === result.label);
                const isExpired = memberData && memberData.expiryDate < todayStr;

                // Box Color: Green for active, Red for expired fee
                const boxColor = isExpired ? '#ef4444' : '#22c55e';
                const drawBox = new faceapi.draw.DrawBox(box, { 
                    label: isExpired ? `${result.label} (FEE EXPIRED)` : `${result.label} (OK)`,
                    boxColor: boxColor 
                });
                drawBox.draw(canvas);

                // Sound Alert every 3 seconds per face detection
                if (Date.now() - lastScanTime > 3000) {
                    if (isExpired) {
                        playSound('warning');
                        if(alertBox) {
                            alertBox.textContent = `ALERT: ${result.label}'s Fee Expired on ${memberData.expiryDate}!`;
                            alertBox.className = 'alert-box danger';
                        }
                    } else {
                        playSound('success');
                        if(alertBox) {
                            alertBox.textContent = `Welcome, ${result.label}! Attendance Marked.`;
                            alertBox.className = 'alert-box success';
                        }
                        recordAttendance(result.label);
                    }
                    lastScanTime = Date.now();
                }
            } else {
                const drawBox = new faceapi.draw.DrawBox(box, { label: 'Unknown' });
                drawBox.draw(canvas);
            }
        });
    }, 1000);
});

setupAutoDates();
loadModels();
