var firebaseConfig = {
    apiKey: "AIzaSyAkZoxB2TfujfWVu_8AttZWKNKZqvSY8D4",
    authDomain: "estacion-de-monitoreo-b2335.firebaseapp.com",
    databaseURL: "https://estacion-de-monitoreo-b2335-default-rtdb.firebaseio.com",
    projectId: "estacion-de-monitoreo-b2335",
    storageBucket: "estacion-de-monitoreo-b2335.appspot.com",
    messagingSenderId: "1024036137806",
    appId: "1:1024036137806:web:xxxx"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.database();
var auth = firebase.auth();

// LÓGICA DE TEMA OSCURO PERSISTENTE
// Se ejecuta inmediatamente al cargar para evitar parpadeos
(function () {
    var savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    }
})();

var lastSavedTimestamp = localStorage.getItem('lastSavedTimestamp') || 0;
var latestSensorData = {};

var thresholds = {
    mq: { warning: 800, danger: 1200 },
    pm25: { warning: 12, danger: 35 },
    pm10: { warning: 54, danger: 154 },
    temp: { low: 18, high: 30 },
    pres: { low: 1000, high: 1020 }
};

function applySettingsAndLoadForm() {
    if (document.getElementById('set-mq-warn')) {
        document.getElementById('set-mq-warn').value = thresholds.mq.warning;
        document.getElementById('set-mq-danger').value = thresholds.mq.danger;
        document.getElementById('set-pm-warn').value = thresholds.pm25.warning;
        document.getElementById('set-pm-danger').value = thresholds.pm25.danger;
        document.getElementById('set-pm10-warn').value = thresholds.pm10.warning;
        document.getElementById('set-pm10-danger').value = thresholds.pm10.danger;
        document.getElementById('set-temp-low').value = thresholds.temp.low;
        document.getElementById('set-temp-high').value = thresholds.temp.high;
        document.getElementById('set-pres-low').value = thresholds.pres.low;
        document.getElementById('set-pres-high').value = thresholds.pres.high;
    }
    updateAllCardStatuses(latestSensorData);
}

function updateAllCardStatuses(d) {
    if (!d || Object.keys(d).length === 0) return;

    var mq = d.MQ135_ppm ? parseFloat(d.MQ135_ppm).toFixed(1) : 0;
    var pm = d['PM2.5'] ? parseFloat(d['PM2.5']).toFixed(1) : (d.PM25 ? parseFloat(d.PM25).toFixed(1) : 0);
    var pm10 = d.PM10 ? parseFloat(d.PM10).toFixed(1) : 0;
    var temp = d.Temperatura ? parseFloat(d.Temperatura).toFixed(1) : 0;
    var pres = d.Presion_hPa ? parseFloat(d.Presion_hPa).toFixed(1) : (d.Presion ? parseFloat(d.Presion).toFixed(1) : 0);

    if (d.MQ135_ppm) updateCardStatus('mq', mq, 'ppm');
    if (d.PM25 || d['PM2.5']) updateCardStatus('pm25', pm, 'µg/m³');
    if (d.PM10) updateCardStatus('pm10', pm10, 'µg/m³');
    if (d.Temperatura) updateCardStatus('temp', temp, '°C');
    if (d.Presion_hPa || d.Presion) updateCardStatus('pres', pres, 'hPa');
}

auth.signInWithEmailAndPassword("esp32@test.com", "123456789")
    .then(function (userCredential) {
        console.log("Autenticado:", userCredential.user.email);
        updateConnectionStatus(true);
        cargarHistorialDesdeFirebase();
    })
    .catch(function (error) {
        console.error("Error Auth:", error);
        updateConnectionStatus(false);
    });

db.ref('configuracion').on('value', function (snapshot) {
    var newThresholds = snapshot.val();
    if (newThresholds) {
        Object.assign(thresholds.mq, newThresholds.mq);
        Object.assign(thresholds.pm25, newThresholds.pm25);
        Object.assign(thresholds.pm10, newThresholds.pm10);
        Object.assign(thresholds.temp, newThresholds.temp);
        Object.assign(thresholds.pres, newThresholds.pres);
        applySettingsAndLoadForm();
    } else {
        db.ref('configuracion').set(thresholds);
    }
});

function updateConnectionStatus(isOnline) {
    var badge = document.getElementById('connectionStatus');
    var text = document.getElementById('statusText');
    if (isOnline) {
        badge.classList.remove('offline');
        text.textContent = "Conectado a Firebase";
    } else {
        badge.classList.add('offline');
        text.textContent = "Error de Conexión con Firebase";
    }
}

function cargarHistorialDesdeFirebase() {
    db.ref('historial_reciente').orderByKey().limitToLast(500).once('value').then(function (snapshot) {
        var historialGuardado = snapshot.val();
        var tbody = document.getElementById('history-body');
        tbody.innerHTML = '';

        // IMPORTANTE NO TOCAR
        // Error horrible, puede que funcione, el ID, es la hora, por lo que si varias personas (navegadores) abren la misma pagina al mismo tiempo, todas, escribe en la misma casilla, entonces no se admite mas de 1 ID con la misma hora, ahora se sobreescribe, y solo es 1 ID, y no x IDs

        if (historialGuardado) {
            var registros = Object.values(historialGuardado);
            var totalRegistros = registros.length;
            registros.forEach(function (registro, index) {
                if (registro && registro.timeStr) {
                    var row = document.createElement('tr');
                    var indiceLegible = totalRegistros - index;
                    row.innerHTML = '<td>#' + indiceLegible + '</td>' +
                        '<td>' + registro.timeStr + '</td>' +
                        '<td>' + registro.mq + '</td>' +
                        '<td>' + registro.pm + '</td>' +
                        '<td>' + registro.pm10 + '</td>' +
                        '<td>' + registro.temp + '</td>' +
                        '<td>' + registro.pres + '</td>';
                    tbody.prepend(row);
                }
            });
        }
    }).catch(function (error) {
        console.error('Error al cargar historial:', error);
    });
}

function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(function (el) {
        el.classList.remove('active');
    });
    document.getElementById('view-' + viewName).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function (el) {
        el.classList.remove('active');
    });
    var navItems = document.querySelectorAll('.nav-item');
    if (viewName === 'dashboard') navItems[0].classList.add('active');
    if (viewName === 'history') navItems[1].classList.add('active');
    if (viewName === 'settings') navItems[2].classList.add('active');
    var titles = { dashboard: 'Dashboard', history: 'Historial de Datos', settings: 'Ajustes' };
    document.getElementById('page-title').textContent = titles[viewName];
}

function saveSettings() {
    var mqWarn = parseFloat(document.getElementById('set-mq-warn').value);
    var mqDanger = parseFloat(document.getElementById('set-mq-danger').value);
    var pmWarn = parseFloat(document.getElementById('set-pm-warn').value);
    var pmDanger = parseFloat(document.getElementById('set-pm-danger').value);
    var pm10Warn = parseFloat(document.getElementById('set-pm10-warn').value);
    var pm10Danger = parseFloat(document.getElementById('set-pm10-danger').value);
    var tempLow = parseFloat(document.getElementById('set-temp-low').value);
    var tempHigh = parseFloat(document.getElementById('set-temp-high').value);
    var presLow = parseFloat(document.getElementById('set-pres-low').value);
    var presHigh = parseFloat(document.getElementById('set-pres-high').value);

    if (mqWarn >= mqDanger) { alert('❌ Error: MQ135 Alerta Amarilla debe ser menor que Alerta Roja'); return; }
    if (pmWarn >= pmDanger) { alert('❌ Error: PM2.5 Alerta Amarilla debe ser menor que Alerta Roja'); return; }
    if (pm10Warn >= pm10Danger) { alert('❌ Error: PM10 Alerta Amarilla debe ser menor que Alerta Roja'); return; }
    if (tempLow >= tempHigh) { alert('❌ Error: Temperatura Mínima debe ser menor que Temperatura Máxima'); return; }
    if (presLow >= presHigh) { alert('❌ Error: Presión Mínima debe ser menor que Presión Máxima'); return; }

    var newThresholds = {
        mq: { warning: mqWarn, danger: mqDanger },
        pm25: { warning: pmWarn, danger: pmDanger },
        pm10: { warning: pm10Warn, danger: pm10Danger },
        temp: { low: tempLow, high: tempHigh },
        pres: { low: presLow, high: presHigh }
    };

    db.ref('configuracion').set(newThresholds)
        .then(() => {
            alert('✅ Ajustes guardados y sincronizados correctamente.');
            switchView('dashboard');
        })
        .catch((error) => {
            alert('❌ Error al guardar la configuración: ' + error.message);
        });
}

function updateCardStatus(key, value, unit) {
    var card = document.getElementById('card-' + key);
    var statusText = document.getElementById(key + '-status-text');
    var valueEl = document.getElementById(key + '-value');
    if (!card) return;
    card.classList.remove('status-success', 'status-warning', 'status-danger', 'status-info');
    var status = 'success';
    var label = 'Normal';

    // Importante: Aqui van el mensajito que va debajo de cada uno en dashboard, decidir si toca cambiar algo ono
    if (key === 'temp') {
        if (value < thresholds.temp.low) {
            status = 'info';
            label = 'Frío';
        } else if (value > thresholds.temp.high) {
            status = 'danger';
            label = 'Calor';
        } else {
            status = 'success';
            label = 'Confort'; // Aca seria si cambiamos confort o algo
        }
    } else if (key === 'pres') {
        if (value < thresholds.pres.low || value > thresholds.pres.high) {
            status = 'warning';
            label = 'Anormal';
        } else {
            status = 'info';
            label = 'Estable';
        }
    } else {
        if (value >= thresholds[key].danger) {
            status = 'danger';
            label = 'Peligro';
        } else if (value >= thresholds[key].warning) {
            status = 'warning';
            label = 'Precaución';
        } else {
            status = 'success';
            label = 'Excelente';
        }
    }

    card.classList.add('status-' + status);
    if (valueEl) valueEl.textContent = value;
    if (statusText) statusText.textContent = label;
}

function addToHistoryTable(timeStr, mq, pm, pm10, temp, pres) {
    var tbody = document.getElementById('history-body');
    if (!tbody) return;
    var row = document.createElement('tr');
    var newIndex = tbody.children.length + 1;
    row.innerHTML = '<td>#' + newIndex + '</td>' +
        '<td>' + timeStr + '</td>' +
        '<td>' + mq + '</td>' +
        '<td>' + pm + '</td>' +
        '<td>' + pm10 + '</td>' +
        '<td>' + temp + '</td>' +
        '<td>' + pres + '</td>';
    tbody.insertBefore(row, tbody.firstChild);
    if (tbody.children.length > 500) {
        tbody.removeChild(tbody.lastChild);
    }
}

function guardarHistorialEnFirebase(timeStr, mq, pm, pm10, temp, pres, currentTimestamp) {
    db.ref('historial_reciente').child(currentTimestamp).set({
        timeStr: timeStr,
        mq: mq,
        pm: pm,
        pm10: pm10,
        temp: temp,
        pres: pres
    });
}

function toggleTheme() {
    var body = document.body;
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
}

db.ref('sensores').on('value', function (snap) {
    var d = snap.val() || {};
    latestSensorData = d;

    var timeStr = "--:--:--";
    var currentTimestamp = d.timestamp || 0;

    if (currentTimestamp) {
        var date = new Date(currentTimestamp);
        var day = String(date.getDate()).padStart(2, '0');
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var year = date.getFullYear();
        var hours = String(date.getHours()).padStart(2, '0');
        var minutes = String(date.getMinutes()).padStart(2, '0');
        var seconds = String(date.getSeconds()).padStart(2, '0');
        timeStr = day + '/' + month + '/' + year + ', ' + hours + ':' + minutes + ':' + seconds;
        document.getElementById('lastGlobal').textContent = timeStr;
    }
    var mq = d.MQ135_ppm ? parseFloat(d.MQ135_ppm).toFixed(1) : 0;
    var pm = d['PM2.5'] ? parseFloat(d['PM2.5']).toFixed(1) : (d.PM25 ? parseFloat(d.PM25).toFixed(1) : 0);
    var pm10 = d.PM10 ? parseFloat(d.PM10).toFixed(1) : 0;
    var temp = d.Temperatura ? parseFloat(d.Temperatura).toFixed(1) : 0;
    var pres = d.Presion_hPa ? parseFloat(d.Presion_hPa).toFixed(1) : (d.Presion ? parseFloat(d.Presion).toFixed(1) : 0);

    updateAllCardStatuses(d);

    if (currentTimestamp && String(currentTimestamp) !== String(lastSavedTimestamp)) {
        lastSavedTimestamp = currentTimestamp;
        addToHistoryTable(timeStr.split(', ')[1], mq, pm, pm10, temp, pres);
        guardarHistorialEnFirebase(timeStr, mq, pm, pm10, temp, pres, currentTimestamp);
    }
});