// YouTube Data Analytics Dashboard
// CSV reading, cleaning, statistics and graphs

const fileInput = document.getElementById("csvFile");
const analyzeBtn = document.getElementById("analyzeBtn");
const sampleBtn = document.getElementById("sampleBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("status");

let cleanedData = [];
let charts = {};

// Expected dataset columns
const requiredColumns = [
    "Channel",
    "Month",
    "Subscribers",
    "Views",
    "Likes"
];

function getSummaryInfo(summary = {}) {
    return {
        originalCount: Number(summary.original_count ?? summary.originalCount ?? 0),
        missingCount: Number(summary.missing_count ?? summary.missingCount ?? 0),
        duplicateCount: Number(summary.duplicate_count ?? summary.duplicateCount ?? 0),
        invalidRows: Number(summary.invalid_rows ?? summary.invalidRows ?? 0),
        finalCount: Number(summary.final_count ?? summary.finalCount ?? 0)
    };
}

// Validate uploaded file in the browser before sending it to Python
function validateUploadedFile(file) {
    if (!file) {
        throw new Error("Please select a CSV file first.");
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Please upload a CSV file.");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("File must be smaller than 5 MB.");
    }
}

async function sendFileToBackend(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || "Unable to read this CSV file.");
    }

    return data;
}

// Read uploaded CSV file
analyzeBtn.addEventListener("click", async () => {
    try {
        const file = fileInput.files[0];
        validateUploadedFile(file);
        statusText.textContent = "Sending CSV to Python for cleaning...";

        const result = await sendFileToBackend(file);
        processData(result.rows || [], result.summary || {});
    } catch (error) {
        statusText.textContent = error.message;
    }
});

async function loadSampleFromBackend() {
    const response = await fetch("/api/sample");
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || "Sample file not found. Use Live Server or upload a CSV.");
    }

    return data;
}

// Load the sample CSV from the project folder
sampleBtn.addEventListener("click", async () => {
    try {
        statusText.textContent = "Loading sample dataset...";
        const result = await loadSampleFromBackend();
        processData(result.rows || [], result.summary || {});
    } catch (error) {
        statusText.textContent = error.message;
    }
});

// Clean and process the dataset returned by Python
function processData(rows, summary = {}) {
    const info = getSummaryInfo(summary);
    cleanedData = Array.isArray(rows) ? rows : [];

    if (!cleanedData.length) {
        throw new Error("No valid records remain after cleaning.");
    }

    updateSummary(info);
    updateCharts();
    updateTable();

    downloadBtn.disabled = false;

    statusText.textContent =
        "Analysis completed successfully! " +
        cleanedData.length + " cleaned records are ready.";
}

// Display summary cards and cleaning report
function updateSummary(info) {
    const channels = [...new Set(
        cleanedData.map(row => row.Channel)
    )];

    const totalViews = cleanedData.reduce(
        (sum, row) => sum + Number(row.Views || 0),
        0
    );

    document.getElementById("totalRecords").textContent =
        cleanedData.length.toLocaleString();

    document.getElementById("totalChannels").textContent =
        channels.length.toLocaleString();

    document.getElementById("totalViews").textContent =
        totalViews.toLocaleString();

    document.getElementById("missingValues").textContent =
        info.missingCount.toLocaleString();

    document.getElementById("cleaningSummary").innerHTML = `
        <p>Original records: ${info.originalCount}</p>
        <p>Missing cells detected: ${info.missingCount}</p>
        <p>Duplicate records removed: ${info.duplicateCount}</p>
        <p>Rows with invalid numeric values detected: ${info.invalidRows}</p>
        <p>Final cleaned records: ${cleanedData.length}</p>
    `;
}

// Destroy an old chart before creating a new one
function drawChart(id, config) {
    if (charts[id]) {
        charts[id].destroy();
    }

    const canvas = document.getElementById(id);

    charts[id] = new Chart(canvas, config);
}

// Generate all graphs
function updateCharts() {
    const channels = [...new Set(
        cleanedData.map(row => row.Channel)
    )];

    const months = [...new Set(
        cleanedData.map(row => row.Month)
    )];

    // 1. Monthly subscriber growth
    const subscriberDatasets = channels.map(channel => ({
        label: channel,

        data: months.map(month => {
            const matchingRows = cleanedData.filter(
                row => row.Channel === channel &&
                       row.Month === month
            );

            // Use the latest available count for a month
            return matchingRows.length
                ? matchingRows[matchingRows.length - 1].Subscribers
                : null;
        }),

        tension: 0.3
    }));

    drawChart("subscriberChart", {
        type: "line",

        data: {
            labels: months,
            datasets: subscriberDatasets
        },

        options: {
            responsive: true,
            maintainAspectRatio: true,

            plugins: {
                legend: {
                    labels: { color: "#e5e7eb" }
                }
            },

            scales: {
                x: {
                    ticks: { color: "#d1d5db" }
                },

                y: {
                    beginAtZero: true,
                    ticks: { color: "#d1d5db" }
                }
            }
        }
    });

    // 2. Channel-wise subscriber comparison
    const latestSubscribers = channels.map(channel => {
        const channelRows = cleanedData.filter(
            row => row.Channel === channel
        );

        return Math.max(
            ...channelRows.map(row => Number(row.Subscribers || 0))
        );
    });

    drawChart("channelChart", {
        type: "bar",

        data: {
            labels: channels,

            datasets: [{
                label: "Subscribers",
                data: latestSubscribers
            }]
        },

        options: {
            responsive: true,

            plugins: {
                legend: { display: false }
            },

            scales: {
                x: {
                    ticks: { color: "#d1d5db" }
                },

                y: {
                    beginAtZero: true,
                    ticks: { color: "#d1d5db" }
                }
            }
        }
    });

    // 3. Scatter plot: views vs likes
    drawChart("scatterChart", {
        type: "scatter",

        data: {
            datasets: channels.map(channel => ({
                label: channel,

                data: cleanedData
                    .filter(row => row.Channel === channel)
                    .map(row => ({
                        x: Number(row.Views || 0),
                        y: Number(row.Likes || 0)
                    }))
            }))
        },

        options: {
            responsive: true,

            plugins: {
                legend: {
                    labels: { color: "#e5e7eb" }
                }
            },

            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Views",
                        color: "#e5e7eb"
                    },

                    ticks: { color: "#d1d5db" }
                },

                y: {
                    title: {
                        display: true,
                        text: "Likes",
                        color: "#e5e7eb"
                    },

                    beginAtZero: true,
                    ticks: { color: "#d1d5db" }
                }
            }
        }
    });

    // 4. Histogram: distribution of views
    Plotly.newPlot(
        "histogramChart",

        [{
            x: cleanedData.map(row => Number(row.Views || 0)),
            type: "histogram",
            nbinsx: 10
        }],

        {
            paper_bgcolor: "#111827",
            plot_bgcolor: "#111827",

            font: { color: "#e5e7eb" },

            xaxis: {
                title: "Views"
            },

            yaxis: {
                title: "Number of Records"
            },

            margin: {
                l: 55,
                r: 20,
                t: 15,
                b: 50
            }
        },

        {
            responsive: true,
            displaylogo: false
        }
    );
}

// Display the first 10 cleaned records
function updateTable() {
    const tableHead = document.getElementById("tableHead");
    const tableBody = document.getElementById("tableBody");

    tableHead.replaceChildren();
    tableBody.replaceChildren();

    if (!cleanedData.length) return;

    const headerRow = document.createElement("tr");

    Object.keys(cleanedData[0]).forEach(column => {
        const th = document.createElement("th");
        th.textContent = column;
        headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);

    cleanedData.slice(0, 10).forEach(row => {
        const tr = document.createElement("tr");

        Object.values(row).forEach(value => {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

// Download the cleaned data as CSV
downloadBtn.addEventListener("click", () => {
    if (!cleanedData.length) return;

    const csv = Papa.unparse(cleanedData);

    const blob = new Blob(
        [csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "cleaned_youtube_data.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
});