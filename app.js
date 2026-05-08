import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// ====== FIREBASE SETUP ======
const firebaseConfig = {
  apiKey: "AIzaSyB5eXdAsDzM9D-1uxyj8cOlI-_zjgTjXAU",
  authDomain: "contadordehorasmonotributo.firebaseapp.com",
  projectId: "contadordehorasmonotributo",
  storageBucket: "contadordehorasmonotributo.firebasestorage.app",
  messagingSenderId: "698528298037",
  appId: "1:698528298037:web:73717a0067afe4fbd4ad7c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== APP STATE ======
let currentUser = null;
let cloudListener = null;
let userRole = 'none'; // 'owner', 'guest'

const state = {
    hourlyRate: 0,
    logs: [],
    guests: []
};

// ====== DOM ELEMENTS ======
const DOM = {
    loginScreen: document.getElementById('loginScreen'),
    appContainer: document.getElementById('appContainer'),
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userProfileInfo: document.getElementById('userProfileInfo'),
    userProfileImg: document.getElementById('userProfileImg'),
    forceSyncBtn: document.getElementById('forceSyncBtn'),
    openConfigBtn: document.getElementById('openConfigBtn'),
    
    configModal: document.getElementById('configModal'),
    closeConfigBtn: document.getElementById('closeConfigBtn'),
    guestEmailInput: document.getElementById('guestEmailInput'),
    guestRoleInput: document.getElementById('guestRoleInput'),
    addGuestBtn: document.getElementById('addGuestBtn'),
    guestsTableBody: document.getElementById('guestsTableBody'),
    
    hourlyRateInput: document.getElementById('hourlyRateInput'),
    saveRateBtn: document.getElementById('saveRateBtn'),
    rateSavedMsg: document.getElementById('rateSavedMsg'),
    
    totalHoursDisplay: document.getElementById('totalHoursDisplay'),
    totalEarningsDisplay: document.getElementById('totalEarningsDisplay'),
    
    logHoursForm: document.getElementById('logHoursForm'),
    dateInput: document.getElementById('dateInput'),
    timeInInput: document.getElementById('timeInInput'),
    timeOutInput: document.getElementById('timeOutInput'),
    dashboardMonthFilter: document.getElementById('dashboardMonthFilter'),
    
    logsTable: document.getElementById('logsTable'),
    logsTableBody: document.getElementById('logsTableBody'),
    emptyState: document.getElementById('emptyState'),
    
    invoiceMonth: document.getElementById('invoiceMonth'),
    generateInvoiceBtn: document.getElementById('generateInvoiceBtn')
};

// ====== INITIALIZATION ======
function init() {
    setDefaultDate();
    setupEventListeners();
    
    // Firebase Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        if(user) {
            currentUser = user;
            DOM.loginScreen.classList.add('hidden');
            DOM.appContainer.classList.remove('hidden');
            
            // Set User profile image
            if (user.photoURL) {
                DOM.userProfileImg.src = user.photoURL;
            } else {
                DOM.userProfileImg.src = "https://ui-avatars.com/api/?name=" + (user.displayName || "G") + "&background=random";
            }
            DOM.userProfileInfo.classList.remove('hidden');
            
            await loadDataFromCloud();
            updateUI();
        } else {
            if (cloudListener) cloudListener(); // kill connection on logout
            currentUser = null;
            DOM.loginScreen.classList.remove('hidden');
            DOM.appContainer.classList.add('hidden');
            DOM.userProfileInfo.classList.add('hidden');
            
            state.hourlyRate = 0;
            state.logs = [];
            updateUI();
        }
    });
}

// ====== DATA MANAGEMENT (FIRESTORE) ======
async function loadDataFromCloud() {
    if (!currentUser) return;
    
    // Clear any previous listeners
    if (cloudListener) cloudListener();
    
    try {
        const docRef = doc(db, 'workspaces', 'global_tracker');
        const snapshot = await getDoc(docRef);
        
        // Logical migration only on first read:
        if (!snapshot.exists()) {
            const localRate = localStorage.getItem('hourlyRate');
            const localLogs = localStorage.getItem('logs');
            if (localLogs) {
                state.hourlyRate = parseFloat(localRate) || 0;
                state.logs = JSON.parse(localLogs) || [];
                // Save immediately so snapshot catches it right after
                await saveToCloud();
                localStorage.removeItem('hourlyRate');
                localStorage.removeItem('logs');
            } else {
                state.hourlyRate = 0;
                state.logs = [];
                // Create explicitly so the listener binds properly
                await saveToCloud(); 
            }
        }
        
        // Empezar a escuchar en "Tiempo Real" (Magia Pura)
        cloudListener = onSnapshot(docRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // --- ROLE BASED ACCESS CONTROL (RBAC) ---
                if (!data.ownerUid) {
                    // Reclaim ownership if the DB is blank
                    userRole = 'owner';
                    await setDoc(docRef, { ownerUid: currentUser.uid, ownerEmail: currentUser.email }, { merge: true });
                } else if (data.ownerUid === currentUser.uid) {
                    userRole = 'owner';
                } else {
                    const foundGuest = (data.guests || []).find(g => 
                        (typeof g === 'string' ? g : g.email) === currentUser.email
                    );
                    if (foundGuest) {
                        const roleLevel = typeof foundGuest === 'string' ? 'guest' : foundGuest.role;
                        userRole = roleLevel === 'editor' ? 'editor' : 'guest';
                    } else {
                        userRole = 'none';
                        alert("⚠️ Acceso Denegado. Tu correo (" + currentUser.email + ") no está en la lista de invitados de este tablero.");
                        if(cloudListener) cloudListener();
                        signOut(auth);
                        return;
                    }
                }
                
                // Set memory state
                const rawGuests = data.guests || [];
                // Scrub potential [object Object] database stringification bug inherited from old versions
                state.guests = rawGuests
                    .filter(g => g !== '[object Object]')
                    .map(g => typeof g === 'string' ? { email: g, role: 'guest' } : g)
                    .filter(g => g && g.email);
                
                state.hourlyRate = data.hourlyRate || 0;
                let finalLogs = data.logs || [];
                
                // --- QUICK RECOVERY MIGRATION SCRIPT ---
                // Si el usuario tenía horas en su cuenta vieja, las inyectamos.
                try {
                    const oldRef = doc(db, 'users', currentUser.uid);
                    const oldSnap = await getDoc(oldRef);
                    if (oldSnap.exists()) {
                        const oldData = oldSnap.data();
                        let needsMerge = false;
                        if (oldData.logs) {
                            oldData.logs.forEach(oldLog => {
                                if (!finalLogs.find(l => l.id === oldLog.id)) {
                                    finalLogs.push(oldLog);
                                    needsMerge = true;
                                }
                            });
                        }
                        if (oldData.hourlyRate && state.hourlyRate === 0) {
                            state.hourlyRate = oldData.hourlyRate;
                            needsMerge = true;
                        }
                        
                        // Si tuvimos que recuperar datos, purgar el viejo y actualizar este nuevo en nube
                        if (needsMerge) {
                            finalLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
                            state.logs = finalLogs;
                            updateUI(); // Pintar rapido
                            await saveToCloud(); // Empujar arriba
                        }
                    }
                } catch(err) {
                    console.error("No se pudo migrar la db vieja", err);
                }
                
                state.logs = finalLogs;
                
                // Do not override user input while they type the Rate, if currently focused
                const isRateInputFocused = document.activeElement === DOM.hourlyRateInput;
                if (!isRateInputFocused) {
                    DOM.hourlyRateInput.value = state.hourlyRate || '';
                }
                
                // Update table visibly instantly!
                updateUI();
            }
        });
        
    } catch (e) {
        console.error("Error cargando datos de Firebase", e);
    }
}

async function saveToCloud() {
    if (!currentUser || userRole === 'guest') return; // Guests aren't allowed to sync writes to cloud logic directly anyway, but protect locally just in case
    
    try {
        const docRef = doc(db, 'workspaces', 'global_tracker');
        await setDoc(docRef, {
            hourlyRate: state.hourlyRate,
            logs: state.logs,
            guests: state.guests,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error("Error guardando en Firebase", e);
        alert("Nota: Tus datos no se lograron guardar en la nube (Posiblemente necesitas habilitar Firestore o ponerlo en Modo Prueba en tu Consola de Firebase).");
    }
}

// ====== LISTENERS ======
function setupEventListeners() {
    DOM.loginBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch(err) {
            console.error("Login failed", err);
            alert("Error de Firebase: " + err.message + "\n\nNota: Si estás abriendo el archivo localmente (doble clic), Firebase bloqueará el acceso. Prueba desde GitHub Pages.");
        }
    });
    
    DOM.logoutBtn.addEventListener('click', () => {
        if(confirm('¿Seguro que deseas cerrar la sesión en este dispositivo?')) {
            signOut(auth);
        }
    });

    DOM.saveRateBtn.addEventListener('click', handleSaveRate);
    DOM.logHoursForm.addEventListener('submit', handleLogHours);
    if(DOM.generateInvoiceBtn) {
        DOM.generateInvoiceBtn.addEventListener('click', handleGenerateInvoice);
    }
    if(DOM.dashboardMonthFilter) {
        DOM.dashboardMonthFilter.addEventListener('change', renderDashboard);
    }
    
    // Guest Configuration List Modal
    if (DOM.openConfigBtn) {
        DOM.openConfigBtn.addEventListener('click', () => {
            renderGuestsTable();
            DOM.configModal.classList.remove('hidden');
        });
        
        DOM.closeConfigBtn.addEventListener('click', () => {
            DOM.configModal.classList.add('hidden');
        });
        
        DOM.addGuestBtn.addEventListener('click', async () => {
            const email = DOM.guestEmailInput.value.trim().toLowerCase();
            const role = DOM.guestRoleInput.value;
            if (!email || !email.includes('@')) return;
            if (email === currentUser.email) return;
            
            const existingIndex = state.guests.findIndex(g => g.email === email);
            if (existingIndex !== -1) {
                state.guests[existingIndex].role = role;
            } else {
                state.guests.push({ email, role });
            }
            
            DOM.guestEmailInput.value = '';
            
            renderGuestsTable();
            await saveToCloud();
        });
    }
    
    if(DOM.forceSyncBtn) {
        DOM.forceSyncBtn.addEventListener('click', async () => {
            DOM.forceSyncBtn.disabled = true;
            DOM.forceSyncBtn.style.opacity = '0.5';
            
            // Promise wrapper with a timeout so it never gets stuck forever if firebase offline mode hangs
            try {
                await Promise.race([
                    saveToCloud(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);
            } catch(e) {
                console.log("Sync delay/timeout caught intentionally or Firebase error");
            }
            
            DOM.forceSyncBtn.style.color = '#10b981'; // Poner en verde sutilmente
            DOM.forceSyncBtn.style.borderColor = '#10b981';
            DOM.forceSyncBtn.style.opacity = '1';
            
            setTimeout(() => {
                DOM.forceSyncBtn.style.color = '';
                DOM.forceSyncBtn.style.borderColor = '';
                DOM.forceSyncBtn.disabled = false;
            }, 1000);
        });
    }
}

function handleSaveRate() {
    const rate = parseFloat(DOM.hourlyRateInput.value);
    if (isNaN(rate) || rate < 0) {
        alert("Por favor, ingresa un valor por hora válido.");
        return;
    }
    
    state.hourlyRate = rate;
    saveToCloud();
    updateUI();
    
    // Show success message
    DOM.rateSavedMsg.classList.remove('hidden');
    setTimeout(() => {
        DOM.rateSavedMsg.classList.add('hidden');
    }, 2000);
}

function handleLogHours(e) {
    e.preventDefault();
    
    const date = DOM.dateInput.value;
    const timeIn = DOM.timeInInput.value;
    const timeOut = DOM.timeOutInput.value;
    
    if (!date || !timeIn || !timeOut) return;
    
    const [inH, inM] = timeIn.split(':').map(Number);
    const [outH, outM] = timeOut.split(':').map(Number);
    
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
    if(diffMins < 0) diffMins += 24 * 60; // cruce medianoche
    
    const hours = Number((diffMins / 60).toFixed(2));
    
    if (hours === 0) {
        alert("La hora de salida no puede ser exactamente igual a la de entrada.");
        return;
    }
    
    const newLog = {
        id: Date.now().toString(),
        date: date,
        timeIn: timeIn,
        timeOut: timeOut,
        hours: hours
    };
    
    state.logs.push(newLog);
    state.logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    saveToCloud();
    updateUI();
    
    DOM.timeOutInput.value = '';
    DOM.timeInInput.focus();
}

// Assign specifically to Window for onClick HTML compatibility
window.deleteLog = async function(id) {
    if (userRole === 'guest') return;
    if(confirm('¿Estás seguro de eliminar este registro?')) {
        state.logs = state.logs.filter(log => log.id !== id);
        renderDashboard();
        renderLogsTable();
        
        await saveToCloud();
    }
}

function renderGuestsTable() {
    DOM.guestsTableBody.innerHTML = '';
    if (!state.guests || state.guests.length === 0) {
        DOM.guestsTableBody.innerHTML = '<tr><td style="color:#94a3b8; padding: 1rem;">No hay invitados definidos aún.</td></tr>';
        return;
    }
    
    state.guests.forEach(guestObj => {
        // Compatibilidad robusta cruzada por si hay strings estropeando la memoria cacheada
        const email = typeof guestObj === 'string' ? guestObj : guestObj.email;
        const role = typeof guestObj === 'string' ? 'guest' : guestObj.role;
        const roleLabel = role === 'editor' ? '✍️ Edición y Carga' : '👀 Lectura';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="width: auto; padding: 0.8rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); color: #f8fafc; font-size: 0.85rem; word-break: break-all; padding-right: 10px;">
                ${email}<br><span style="color: #60a5fa; font-size: 0.75rem;">${roleLabel}</span>
            </td>
            <td style="width: 85px; padding: 0.8rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right;">
                <button class="btn-danger" style="margin: 0; padding: 0.4rem 0!important; width: 100%; text-align: center; font-size: 0.8rem;" onclick="removeGuest('${email}')">Quitar</button>
            </td>
        `;
        DOM.guestsTableBody.appendChild(row);
    });
}

window.removeGuest = async function(email) {
    if(confirm(`¿Estás seguro de que quieres quitar a ${email}?`)) {
        state.guests = state.guests.filter(g => {
            const gEmail = typeof g === 'string' ? g : g.email;
            return gEmail !== email;
        });
        renderGuestsTable();
        await saveToCloud();
    }
}

// ====== UI RENDERING ======
function updateUI() {
    populateMonths();
    renderDashboard();
    renderLogsTable();
    applyRoleRestrictions();
}

function applyRoleRestrictions() {
    if (userRole === 'owner' || userRole === 'editor') {
        DOM.forceSyncBtn.classList.remove('hidden');
        if (userRole === 'owner') {
            DOM.openConfigBtn.classList.remove('hidden');
        } else {
            DOM.openConfigBtn.classList.add('hidden');
        }
        if(DOM.logHoursForm && DOM.logHoursForm.parentElement) {
            DOM.logHoursForm.parentElement.classList.remove('hidden');
        }
        DOM.hourlyRateInput.disabled = false;
        DOM.saveRateBtn.classList.remove('hidden');
    } else if (userRole === 'guest') {
        DOM.forceSyncBtn.classList.add('hidden');
        DOM.openConfigBtn.classList.add('hidden');
        if(DOM.logHoursForm && DOM.logHoursForm.parentElement) {
            DOM.logHoursForm.parentElement.classList.add('hidden');
        }
        DOM.hourlyRateInput.disabled = true;
        DOM.saveRateBtn.classList.add('hidden');
    }
}

function populateMonths() {
    if (!DOM.invoiceMonth) return;
    const months = new Set();
    state.logs.forEach(log => {
        const logMonth = log.date.substring(0, 7);
        months.add(logMonth);
    });
    
    const sorted = Array.from(months).sort().reverse();
    const currentDashFilter = DOM.dashboardMonthFilter ? DOM.dashboardMonthFilter.value : "all";
    
    DOM.invoiceMonth.innerHTML = '';
    if(DOM.dashboardMonthFilter) {
        DOM.dashboardMonthFilter.innerHTML = '<option value="all">Histórico Global</option>';
    }
    
    if (sorted.length === 0) {
        DOM.invoiceMonth.innerHTML = '<option value="">No hay registros</option>';
        DOM.generateInvoiceBtn.disabled = true;
        DOM.generateInvoiceBtn.style.opacity = '0.5';
        return;
    }
    
    DOM.generateInvoiceBtn.disabled = false;
    DOM.generateInvoiceBtn.style.opacity = '1';
    sorted.forEach(m => {
        const [year, month] = m.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, 1);
        const name = dateObj.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const capName = name.charAt(0).toUpperCase() + name.slice(1);
        
        const optInv = document.createElement('option');
        optInv.value = m;
        optInv.textContent = capName;
        DOM.invoiceMonth.appendChild(optInv);
        
        if(DOM.dashboardMonthFilter) {
            const optDash = document.createElement('option');
            optDash.value = m;
            optDash.textContent = capName;
            DOM.dashboardMonthFilter.appendChild(optDash);
        }
    });
    
    if(DOM.dashboardMonthFilter) {
        if (Array.from(DOM.dashboardMonthFilter.options).some(opt => opt.value === currentDashFilter && currentDashFilter !== 'all')) {
            DOM.dashboardMonthFilter.value = currentDashFilter;
        } else if (sorted.length > 0) {
            DOM.dashboardMonthFilter.value = sorted[0]; // Auto pick default latest explicitly!
        }
    }
}

function handleGenerateInvoice() {
    const selectedMonth = DOM.invoiceMonth.value;
    if (!selectedMonth) return;
    
    const monthLogs = state.logs.filter(log => log.date.substring(0, 7) === selectedMonth);
    const totalHoras = monthLogs.reduce((acc, l) => acc + l.hours, 0);
    const subtotal = totalHoras * state.hourlyRate;
    
    const [year, month] = selectedMonth.split('-');
    const mName = new Date(year, parseInt(month) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

    const printArea = document.getElementById('invoicePrintArea');
    if(!printArea) return;

    printArea.innerHTML = `
        <div style="font-family: 'Inter', sans-serif; color: #000; text-align: left; background: #fff;">
            <div style="font-size: 28px; font-weight: bold; color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px;">Reporte de Honorarios</div>
            <div style="margin-bottom: 30px; line-height: 1.6; font-size: 14px;">
                <p style="margin: 0;"><strong>Fecha de Emisión:</strong> <span>${new Date().toLocaleDateString('es-AR')}</span></p>
                <p style="margin: 0;"><strong>Período Liquidado:</strong> <span style="text-transform: uppercase;">${mName}</span></p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; text-align: left;">
                <thead>
                    <tr style="background: #f1f5f9; color: #334155;">
                        <th style="padding: 12px; border: 1px solid #cbd5e1;">Descripción</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1;">Horas Totales</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1;">Valor por Hora</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1;">Subtotal a Pagar</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">Servicios Prestados (Monotributo)</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">${totalHoras} hs</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">${formatter.format(state.hourlyRate)}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; font-weight: bold;">${formatter.format(subtotal)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="margin-top: 40px; text-align: right;">
                <h2 style="font-size: 20px; margin: 0;">TOTAL DEL MES: <span>${formatter.format(subtotal)}</span></h2>
            </div>
            
            <div style="margin-top: 60px; font-size: 11px; color: #666; text-align: center; border-top: 1px solid #ccc; padding-top: 10px;">
                Documento autogenerado a través de la aplicación "Contador de Horas".
            </div>
        </div>
    `;

    setTimeout(() => {
        window.print();
    }, 150);
}

function renderDashboard() {
    const filterData = DOM.dashboardMonthFilter ? DOM.dashboardMonthFilter.value : 'all';
    let filteredLogs = state.logs;
    
    if(filterData && filterData !== 'all') {
        filteredLogs = state.logs.filter(log => log.date.substring(0, 7) === filterData);
    }

    const totalHours = filteredLogs.reduce((acc, log) => acc + log.hours, 0);
    const totalEarnings = totalHours * state.hourlyRate;
    
    DOM.totalHoursDisplay.textContent = totalHours.toFixed(totalHours % 1 === 0 ? 0 : 2);
    const formattedEarnings = '$ ' + totalEarnings.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    DOM.totalEarningsDisplay.textContent = formattedEarnings;
}

function renderLogsTable() {
    DOM.logsTableBody.innerHTML = '';
    
    if (state.logs.length === 0) {
        DOM.logsTable.classList.add('hidden');
        DOM.emptyState.classList.remove('hidden');
        return;
    }
    
    DOM.logsTable.classList.remove('hidden');
    DOM.emptyState.classList.add('hidden');
    
    state.logs.forEach(log => {
        const row = document.createElement('tr');
        
        const dateObj = new Date(log.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
        const earning = (log.hours * state.hourlyRate).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        // Compatibilidad con logs viejos
        const timeStr = (log.timeIn && log.timeOut) ? `${log.timeIn} - ${log.timeOut}` : 'Manual';
        
        const deleteHtml = (userRole === 'owner' || userRole === 'editor') 
            ? `<button class="btn-danger" onclick="deleteLog('${log.id}')">Eliminar</button>` 
            : `<span style="color: #94a3b8; font-size: 0.85rem;">Solo lectura</span>`;
        
        row.innerHTML = `
            <td><strong>${dateStr}</strong></td>
            <td>${timeStr}</td>
            <td>${log.hours} h</td>
            <td>$ ${earning}</td>
            <td>
                ${deleteHtml}
            </td>
        `;
        
        DOM.logsTableBody.appendChild(row);
    });
}

function setDefaultDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    DOM.dateInput.value = `${year}-${month}-${day}`;
}

// ====== START APP ======
init();
