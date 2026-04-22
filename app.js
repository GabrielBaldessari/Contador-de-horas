import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

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

const state = {
    hourlyRate: 0,
    logs: [] // Array of { id, date, hours }
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
    syncText: document.getElementById('syncText'),
    
    hourlyRateInput: document.getElementById('hourlyRateInput'),
    saveRateBtn: document.getElementById('saveRateBtn'),
    rateSavedMsg: document.getElementById('rateSavedMsg'),
    
    totalHoursDisplay: document.getElementById('totalHoursDisplay'),
    totalEarningsDisplay: document.getElementById('totalEarningsDisplay'),
    
    logHoursForm: document.getElementById('logHoursForm'),
    dateInput: document.getElementById('dateInput'),
    hoursInput: document.getElementById('hoursInput'),
    
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
    try {
        const docRef = doc(db, 'users', currentUser.uid);
        const snapshot = await getDoc(docRef);
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            state.hourlyRate = data.hourlyRate || 0;
            state.logs = data.logs || [];
        } else {
            // First time logic, try to migrate from localStorage if available
            const localRate = localStorage.getItem('hourlyRate');
            const localLogs = localStorage.getItem('logs');
            if (localLogs) {
                state.hourlyRate = parseFloat(localRate) || 0;
                state.logs = JSON.parse(localLogs) || [];
                // Migrate to Firebase and wipe local so it doesn't bleed into other Google accounts
                await saveToCloud();
                localStorage.removeItem('hourlyRate');
                localStorage.removeItem('logs');
            } else {
                state.hourlyRate = 0;
                state.logs = [];
            }
        }
        
        DOM.hourlyRateInput.value = state.hourlyRate || '';
    } catch (e) {
        console.error("Error cargando datos de Firebase", e);
    }
}

async function saveToCloud() {
    if (!currentUser) return;
    try {
        const docRef = doc(db, 'users', currentUser.uid);
        await setDoc(docRef, {
            hourlyRate: state.hourlyRate,
            logs: state.logs,
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
    
    if(DOM.forceSyncBtn) {
        DOM.forceSyncBtn.addEventListener('click', async () => {
            const originalText = DOM.syncText.innerText;
            DOM.syncText.innerText = "Guardando...";
            DOM.forceSyncBtn.disabled = true;
            DOM.forceSyncBtn.style.opacity = '0.7';
            
            await saveToCloud();
            
            DOM.syncText.innerText = "¡Listo!";
            DOM.syncText.style.color = "#10b981"; // success green
            
            setTimeout(() => {
                DOM.syncText.innerText = originalText;
                DOM.syncText.style.color = "";
                DOM.forceSyncBtn.disabled = false;
                DOM.forceSyncBtn.style.opacity = '1';
            }, 2500);
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
    const hours = parseFloat(DOM.hoursInput.value);
    
    if (!date || isNaN(hours) || hours <= 0) return;
    
    const newLog = {
        id: Date.now().toString(),
        date: date,
        hours: hours
    };
    
    state.logs.push(newLog);
    state.logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    saveToCloud();
    updateUI();
    
    DOM.hoursInput.value = '';
    DOM.hoursInput.focus();
}

// Assign specifically to Window for onClick HTML compatibility
window.deleteLog = function(id) {
    if(confirm('¿Estás seguro de que deseas eliminar este registro?')) {
        state.logs = state.logs.filter(log => log.id !== id);
        saveToCloud();
        updateUI();
    }
}

// ====== UI RENDERING ======
function updateUI() {
    renderDashboard();
    renderLogsTable();
    populateMonths();
}

function populateMonths() {
    if (!DOM.invoiceMonth) return;
    const months = new Set();
    state.logs.forEach(log => {
        const logMonth = log.date.substring(0, 7);
        months.add(logMonth);
    });
    
    const sorted = Array.from(months).sort().reverse();
    
    DOM.invoiceMonth.innerHTML = '';
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
        
        const option = document.createElement('option');
        option.value = m;
        option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        DOM.invoiceMonth.appendChild(option);
    });
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
    const totalHours = state.logs.reduce((acc, log) => acc + log.hours, 0);
    const totalEarnings = totalHours * state.hourlyRate;
    
    DOM.totalHoursDisplay.textContent = totalHours.toFixed(totalHours % 1 === 0 ? 0 : 1);
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
        
        row.innerHTML = `
            <td><strong>${dateStr}</strong></td>
            <td>${log.hours} h</td>
            <td>$ ${earning}</td>
            <td>
                <button class="btn-danger" onclick="deleteLog('${log.id}')">Eliminar</button>
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
