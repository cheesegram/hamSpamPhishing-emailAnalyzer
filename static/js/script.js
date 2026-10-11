// ============================================================
// EMAIL ANALYZER SCRIPT
// Handles sample chips, API calls, and rendering of the
// Ham / Spam / Phishing result card in the dashboard.
// ============================================================

const emailForm = document.getElementById("emailForm");
const emailText = document.getElementById("emailText");
const resultBox = document.getElementById("resultBox");
const analyzeButton = document.getElementById("analyzeButton");
const sampleChips = document.querySelectorAll(".sample-chip");

// ------------------------------------------------------------
// 1. SAMPLE CHIP CLICK HANDLERS
// ------------------------------------------------------------
sampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
        const sampleText = chip.getAttribute("data-email");
        if (sampleText) {
            emailText.value = sampleText;
            emailText.focus();
        }
    });
});

// ------------------------------------------------------------
// 2. RESULT CARD RENDERER
// ------------------------------------------------------------
function renderResultCard(data, originalEmail) {
    const category = (data.category || "Unknown").toLowerCase();

    let badgeText = "Unknown";
    let toneClass = "tone-unknown";

    if (category.includes("ham")) {
        badgeText = "Ham";
        toneClass = "tone-ham";
    } else if (category.includes("phish")) {
        badgeText = "Phishing";
        toneClass = "tone-phishing";
    } else if (category.includes("spam")) {
        badgeText = "Spam";
        toneClass = "tone-spam";
    }

    let translationHtml = "";
    if (data.translation_applied && data.translated_email) {
        translationHtml = `
            <div class="result-block">
                <span class="block-label">English translation (via Gemini)</span>
                <p class="translation-text">"${escapeHtml(data.translated_email)}"</p>
            </div>
        `;
    }

    resultBox.className = "panel-body result-box";
    resultBox.innerHTML = `
        <div class="result-card ${toneClass}">
            <div class="result-head">
                <span class="category-badge">
                    <span class="badge-dot" aria-hidden="true"></span>
                    ${badgeText}
                </span>
                <span class="result-meta">ML classification + AI explanation</span>
            </div>

            <div class="result-block">
                <span class="block-label">Your email</span>
                <blockquote class="email-quote">"${escapeHtml(originalEmail)}"</blockquote>
            </div>

            ${translationHtml}

            <div class="result-block">
                <span class="block-label">Gemini explanation</span>
                <p class="explanation-text">
                    ${escapeHtml(data.explanation || "No explanation provided.")}
                </p>
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ------------------------------------------------------------
// 3. FORM SUBMISSION
// ------------------------------------------------------------
emailForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = emailText.value.trim();

    if (email === "") {
        resultBox.className = "panel-body result-box";
        resultBox.innerHTML = `
            <div class="error-state">
                <strong>Empty input</strong>
                <p>Please paste an email before analyzing.</p>
            </div>
        `;
        return;
    }

    analyzeButton.disabled = true;
    const originalBtnContent = analyzeButton.innerHTML;
    analyzeButton.textContent = "Analyzing...";

    // Loading state
    resultBox.className = "panel-body result-box";
    resultBox.innerHTML = `
        <div class="loading-state">
            <span class="spinner" aria-hidden="true"></span>
            <span>Analyzing email with the ML model &amp; Gemini...</span>
        </div>
    `;

    try {
        const response = await fetch("/predict", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Classification failed."
            );
        }

        renderResultCard(data, email);

    } catch (error) {
        resultBox.className = "panel-body result-box";
        resultBox.innerHTML = `
            <div class="error-state">
                <strong>Analysis failed</strong>
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;
        console.error(error);

    } finally {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = originalBtnContent;
    }
});
