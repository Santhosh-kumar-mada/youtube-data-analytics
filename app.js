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

// Check if the required columns exist
function validateColumns(rows) {
    if (!rows.length) {
        throw new Error("The CSV file is empty.");
    }

    const columns = Object.keys(rows[0]);

    const missingColumns = requiredColumns.filter(
        column => !columns.includes(column)
    );

    if (missingColumns.length) {
        throw new Error(
            "Missing columns: " + missingColumns.join(", ")
        );
    }
}

// Read uploaded CSV file
analyzeBtn.addEventListener("click", () => {
    const file = fileInput.files[0];

    if (!file) {
        statusText.textContent = "Please select a CSV file first.";
        return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
        statusText.textContent = "Please upload a CSV file.";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        statusText.textContent = "File must be smaller than 5 MB.";
        return;
    }

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,

        complete: function (result) {
            try {
                processData(result.data);
            } catch (error) {
                statusText.textContent = error.message;
            }
        },

        error: function () {
            statusText.textContent = "Unable to read this CSV file.";
        }
    });
});

// Load the sample CSV from the project folder
sampleBtn.addEventListener("click", async () => {
    try {
        statusText.textContent = "Loading sample dataset...";

        const response = await fetch(
            "data/sample_youtube_data.csv"
        );

        if (!response.ok) {
            throw new Error(
                "Sample file not found. Use Live Server or upload a CSV."
            );
        }

        const csvText = await response.text();

        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,

            complete: function (result) {
                try {
                    processData(result.data);
                } catch (error) {
                    statusText.textContent = error.message;
                }
            }
        });
    } catch (error) {
        statusText.textContent = error.message;
    }
});

// Clean and process the dataset
function processData(rows) {
    validateColumns(rows);

    const originalCount = rows.length;

    // Count missing cells before cleaning
    let missingCount = 0;

    rows.forEach(row => {
        requiredColumns.forEach(column => {
            if (
                row[column] === undefined ||
                row[column] === null ||
                String(row[column]).trim() === ""
            ) {
                missingCount++;
            }
        });
    });

    // Remove completely empty rows
    let data = rows.filter(row =>
        requiredColumns.some(
            column => String(row[column] ?? "").trim() !== ""
        )
    );

    // Standardize text and convert numeric columns
    data = data.map(row => {
        const cleaned = {};

        cleaned.Channel = String(row.Channel ?? "").trim();
        cleaned.Month = String(row.Month ?? "").trim();

        ["Subscribers", "Views", "Likes"].forEach(column => {
            const value = String(row[column] ?? "").trim();
            const number = Number(value);

            cleaned[column] =
                value !== "" && Number.isFinite(number)
                    ? number
                    : null;
        });

        return cleaned;
    });

    // Remove records without essential identifying information
    data = data.filter(row =>
        row.Channel !== "" && row.Month !== ""
    );

    // Identify invalid numeric values
    const invalidRows = data.filter(row =>
        ["Subscribers", "Views", "Likes"].some(column =>
            row[column] === null || row[column] < 0
        )
    ).length;

    // Replace missing or negative numeric values with zero.
    // This is a simple demo strategy, not suitable for every dataset.
    data = data.map(row => {
        ["Subscribers", "Views", "Likes"].forEach(column => {
            if (row[column] === null || row[column] < 0) {
                row[column] = 0;
            }
        });

        return row;
    });

    // Remove exact duplicate records
    const beforeDuplicates = data.length;

    const uniqueData = [];
    const seen = new Set();

    data.forEach(row => {
        const key = JSON.stringify(row);

        if (!seen.has(key)) {
            seen.add(key);
            uniqueData.push(row);
        }
    });

    const duplicateCount = beforeDuplicates - uniqueData.length;

    cleanedData = uniqueData;

    if (!cleanedData.length) {
        throw new Error("No valid records remain after cleaning.");
    }

    // Update dashboard
    updateSummary({
        originalCount,
        missingCount,
        duplicateCount,
        invalidRows
    });

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
        (sum, row) => sum + row.Views,
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
            ...channelRows.map(row => row.Subscribers)
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
                        x: row.Views,
                        y: row.Likes
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
            x: cleanedData.map(row => row.Views),
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