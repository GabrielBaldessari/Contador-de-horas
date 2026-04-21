// ====== APP STATE ======
const state = {
    hourlyRate: 0,
    logs: [] // Array of { id, date, hours }
};

// ====== DOM ELEMENTS ======
const DOM = {
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
    loadData();
    setDefaultDate();
    setupEventListeners();
    updateUI();
}

// ====== DATA MANAGEMENT ======
function loadData() {
    const rate = localStorage.getItem('hourlyRate');
    const logs = localStorage.getItem('logs');
    
    if (rate) state.hourlyRate = parseFloat(rate);
    if (logs) state.logs = JSON.parse(logs);
    
    // Set initial input values
    DOM.hourlyRateInput.value = state.hourlyRate ? state.hourlyRate : '';
}

function saveData() {
    localStorage.setItem('hourlyRate', state.hourlyRate);
    localStorage.setItem('logs', JSON.stringify(state.logs));
}

// ====== LISTENERS ======
function setupEventListeners() {
    DOM.saveRateBtn.addEventListener('click', handleSaveRate);
    DOM.logHoursForm.addEventListener('submit', handleLogHours);
    if(DOM.generateInvoiceBtn) {
        DOM.generateInvoiceBtn.addEventListener('click', handleGenerateInvoice);
    }
}

function handleSaveRate() {
    const rate = parseFloat(DOM.hourlyRateInput.value);
    if (isNaN(rate) || rate < 0) {
        alert("Por favor, ingresa un valor por hora válido.");
        return;
    }
    
    state.hourlyRate = rate;
    saveData();
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
    
    saveData();
    updateUI();
    
    // Reset hours input
    DOM.hoursInput.value = '';
    DOM.hoursInput.focus();
}

// Globally available for inline onclick attributes
window.deleteLog = function(id) {
    if(confirm('¿Estás seguro de que deseas eliminar este registro?')) {
        state.logs = state.logs.filter(log => log.id !== id);
        saveData();
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
        // extract YYYY-MM
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
    
    const template = document.getElementById('invoiceContent');
    document.getElementById('invDateOptions').textContent = new Date().toLocaleDateString('es-AR');
    
    const [year, month] = selectedMonth.split('-');
    const mName = new Date(year, parseInt(month) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    document.getElementById('invPeriod').textContent = mName.toUpperCase();
    
    document.getElementById('invHoras').textContent = totalHoras + " hs";
    
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    document.getElementById('invValor').textContent = formatter.format(state.hourlyRate);
    document.getElementById('invSubtotal').textContent = formatter.format(subtotal);
    document.getElementById('invTotal').textContent = formatter.format(subtotal);
    
    const templateContainer = document.getElementById('invoiceTemplate');
    templateContainer.style.display = 'block';
    
    const opt = {
        margin:       [0.5, 0.5],
        filename:     `Factura_${selectedMonth}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(template).save().then(() => {
        templateContainer.style.display = 'none';
    });
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
        
        const dateObj = new Date(log.date + 'T00:00:00'); // Prevent timezone shift depending on local timezone
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
document.addEventListener('DOMContentLoaded', init);
