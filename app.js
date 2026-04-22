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
    
    const [year, month] = selectedMonth.split('-');
    const mName = new Date(year, parseInt(month) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

    // Generar la estructura unida al DOM pero invisible para garantizar render exacto
    const printElement = document.createElement('div');
    printElement.style.position = 'fixed'; // Elimina bugs de scrollY
    printElement.style.top = '0';
    printElement.style.left = '0';
    printElement.style.width = '794px'; // Ancho de A4 a 96DPI
    printElement.style.background = '#ffffff';
    printElement.style.zIndex = '-9999'; // Oculto detrás de la app real
    
    printElement.innerHTML = `
        <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #1e293b; text-align: left; background: #ffffff;">
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
                        <td style="padding: 12px; border: 1px solid #cbd5e1;">Servicios Prestados (Monotributo)</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1;">${totalHoras} hs</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1;">${formatter.format(state.hourlyRate)}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${formatter.format(subtotal)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="margin-top: 40px; text-align: right;">
                <h2 style="font-size: 20px; color: #0f172a; margin: 0;">TOTAL DEL MES: <span style="color: #3b82f6;">${formatter.format(subtotal)}</span></h2>
            </div>
            
            <div style="margin-top: 60px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px;">
                Documento generado automáticamente a través de la aplicación "Contador de Horas".
            </div>
        </div>
    `;

    document.body.appendChild(printElement); // Lo atamos al DOM principal
    
    // Configuración robusta para evitar recorte
    const opt = {
        margin:       0.5, // 0.5 pulgadas para márgenes reales
        filename:     `Factura_${selectedMonth}.pdf`,
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            scrollY: 0, // Ignora el scroll actual
            windowWidth: 794 // Asegura medidas base de lienzo 
        },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(printElement).save().then(() => {
        // Limpiamos el DOM oculto una vez generado
        document.body.removeChild(printElement);
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
