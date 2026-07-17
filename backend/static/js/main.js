const windChart = new Chart(document.getElementById('windChart'), {
    type: 'line',
    data: {
        labels: ['10:00', '11:00', '12:00', '13:00'],
        datasets: [{
            label: 'Gemeten Wind',
            data: [10, 12, 8, 11],
            borderColor: 'blue',
            fill: false
        }, {
            label: 'Live Wind',
            data: [11, 11, 9, 12],
            borderColor: 'green',
            fill: false
        }, {
            label: 'Voorspelde Wind',
            data: [12, 13, 14, 15],
            borderColor: 'red',
            fill: false
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Windsnelheid (knopen)'
                }
            }
        }
    }
});

const waveChart = new Chart(document.getElementById('waveChart'), {
    type: 'bar',
    data: {
        labels: ['10:00', '11:00', '12:00'],
        datasets: [{
            label: 'Golfhoogte (m)',
            data: [1.2, 1.5, 1.3],
            backgroundColor: 'rgba(0, 122, 255, 0.6)'
        }]
    },
    options: {
        responsive: true
    }
});

const tideChart = new Chart(document.getElementById('tideChart'), {
    type: 'line',
    data: {
        labels: ['10:00', '11:00', '12:00'],
        datasets: [{
            label: 'Getijdehoogte (m)',
            data: [0.3, 0.6, 0.4],
            borderColor: 'navy',
            fill: false
        }]
    },
    options: {
        responsive: true
    }
});
