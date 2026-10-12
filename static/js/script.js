const emailForm = document.getElementById("emailForm");
const emailText = document.getElementById("emailText");
const emailLinks = document.getElementById("emailLinks");
const resultBox = document.getElementById("resultBox");
const visionBox = document.getElementById("visionBox");
const analyzeButton = document.getElementById("analyzeButton");
const sampleChips = document.querySelectorAll(".sample-chip");

sampleChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
        const sampleHtml = chip.getAttribute("data-email");
        if (sampleHtml) {
            emailText.innerHTML = sampleHtml;
            emailText.focus();
            harvestLinks();
        }
    });
});

emailText.addEventListener("paste", function (event) {
    const clipboardData = event.clipboardData;
    const range = document.createRange();
    range.selectNodeContents(emailText);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rawText = clipboardData ? clipboardData.getData("text/plain") : "";
    if (!rawText) {
        return;
    }
    const urlPattern = /(https?:\/\/[^\s<>'\"()]+|www\.[^\s<>'\"()]+)/gi;
    const pastedLinks = [];
    let match;
    while ((match = urlPattern.exec(rawText)) !== null) {
        const url = match[1].replace(/[.,;:!?]+$/, "").trim();
        if (url) {
            pastedLinks.push(url);
        }
    }
    let html = rawText.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
    html = html.replace(urlPattern, function (matched) {
        const clean = matched.replace(/[.,;:!?]+$/, "").trim();
        return '<a href="' + escapeHtmlAttr(clean) + '">' + clean + "</a>";
    });
    try {
        const fragment = document.createRange().createContextualFragment(html);
        document.execCommand("insertHTML", false, fragment);
    } catch (error) {
        emailText.innerHTML = rawText;
    }
    pastedLinks.forEach(function (url) { harvestLink(url); });
});

function harvestLink(url) {
    if (!url) return;
    const normalized = url.replace(/^https?:\/\//i, "").replace(/\/+$/i, "").toLowerCase();
    if (!normalized) return;
    if (emailLinks.value) {
        const values = emailLinks.value.split(",");
        if (values.indexOf(normalized) === -1) {
            emailLinks.value = emailLinks.value + "," + normalized;
        }
    } else {
        emailLinks.value = normalized;
    }
}

function harvestLinks() {
    emailLinks.value = "";
    const source = emailText.innerHTML;
    if (!source) return;
    const seen = [];
    const urlPattern = /(https?:\/\/[^\s<>'\"()]+|www\.[^\s<>'\"()]+)/gi;
    let match;
    while ((match = urlPattern.exec(source)) !== null) {
        const cleaned = match[1].replace(/[.,;:!?]+$/, "").trim();
        const key = cleaned.replace(/^https?:\/\//i, "").replace(/\/+$/i, "").toLowerCase();
        if (cleaned && seen.indexOf(key) === -1) {
            seen.push(key);
            harvestLink(cleaned);
        }
    }
    const anchorPattern = /<a[^>]*href=(["'])(.*?)\1[^>]*>/gi;
    let anchor;
    while ((anchor = anchorPattern.exec(source)) !== null) {
        harvestLink(anchor[2]);
    }
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function escapeHtmlAttr(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderResultCard(data) {
    const category = (data.category || "Unknown").toLowerCase();
    let badgeText = "Unknown";
    let toneClass = "tone-unknown";
    if (category.indexOf("ham") !== -1) {
        badgeText = "Ham";
        toneClass = "tone-ham";
    } else if (category.indexOf("phish") !== -1) {
        badgeText = "Phishing";
        toneClass = "tone-phishing";
    } else if (category.indexOf("spam") !== -1) {
        badgeText = "Spam";
        toneClass = "tone-spam";
    }
    let translationHtml = "";
    if (data.translation_applied && data.translated_email) {
        translationHtml =
            '<div class="result-block">' +
            '<span class="block-label">English translation (via Gemini)</span>' +
            '<p class="translation-text">"' + escapeHtml(data.translated_email) + '"</p>' +
            "</div>";
    }
    const confidence = data.confidence || {};
    const meterNames = ["Ham", "Phishing", "Spam"];
    let meterBars = "";
    for (let i = 0; i < meterNames.length; i++) {
        const name = meterNames[i];
        let value = Number(confidence[name]);
        if (isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        const label = value.toFixed(1) + "%";
        meterBars +=
            '<div class="meter-row">' +
            '<div class="meter-top">' +
            '<span class="meter-name meter-' + name.toLowerCase() + '">' + name + "</span>" +
            '<span class="meter-value">' + label + "</span>" +
            "</div>" +
            '<div class="meter-track" role="progressbar" aria-valuenow="' + label +
            '" aria-valuemin="0" aria-valuemax="100" aria-label="' + name + ' confidence">' +
            '<div class="meter-fill meter-fill-' + name.toLowerCase() + '" style="width: ' + label + ';"></div>' +
            "</div></div>";
    }
    resultBox.className = "panel-body result-box";
    resultBox.innerHTML =
        '<div class="result-card ' + toneClass + '">' +
        '<div class="result-head">' +
        '<span class="category-badge">' +
        '<span class="badge-dot" aria-hidden="true"></span>' + badgeText +
        "</span>" +
        '<span class="result-meta">ML classification + AI explanation</span>' +
        "</div>" +
        translationHtml +
        '<div class="result-columns">' +
        '<div class="result-side">' +
        '<span class="block-label">Confidence</span>' +
        '<div class="meter-list">' + meterBars + "</div>" +
        "</div>" +
        '<div class="result-main">' +
        '<span class="block-label">Gemini explanation</span>' +
        '<p class="explanation-text">' + escapeHtml(data.explanation || "No explanation provided.") + "</p>" +
        "</div></div></div>";
}

emailForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const raw = emailText.innerText.trim();
    if (raw === "") {
        resultBox.className = "panel-body result-box";
        resultBox.innerHTML =
            '<div class="error-state"><strong>Empty input</strong>' +
            "<p>Please paste an email before analyzing.</p></div>";
        return;
    }
    harvestLinks();
    const email = raw.split(/\n{2,}/).join("\n").split(/\n/).join(" ");
    analyzeButton.disabled = true;
    const originalBtnContent = analyzeButton.innerHTML;
    analyzeButton.textContent = "Analyzing...";
    resultBox.className = "panel-body result-box";
    resultBox.innerHTML =
        '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>' +
        "<span>Analyzing email with the ML model &amp; Gemini...</span></div>";
    visionBox.className = "panel-body vision-box";
    visionBox.innerHTML =
        '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>' +
        "<span>Opening links and capturing website screenshots...</span></div>";
    fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
    }).then(function (response) {
        return response.json().then(function (data) {
            return { ok: response.ok, data: data };
        });
    }).then(function (result) {
        if (!result.ok) {
            throw new Error(result.data.error || "Classification failed.");
        }
        renderResultCard(result.data);
        return runVision();
    }).catch(function (error) {
        resultBox.className = "panel-body result-box";
        resultBox.innerHTML =
            '<div class="error-state"><strong>Analysis failed</strong>' +
            "<p>" + escapeHtml(error.message) + "</p></div>";
        visionBox.className = "panel-body vision-box";
        visionBox.innerHTML =
            '<div class="empty-state"><span class="empty-icon" aria-hidden="true">&#128065;</span>' +
            "<strong>No vision analysis yet</strong>" +
            "<p>Vision runs after a successful email analysis.</p></div>";
    }).then(function () {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = originalBtnContent;
    });
});

function runVision() {
    return fetch("/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailText.innerHTML })
    }).then(function (response) {
        return response.json().then(function (data) {
            return { ok: response.ok, data: data };
        });
    }).then(function (result) {
        if (!result.ok) {
            throw new Error(result.data.error || "Vision analysis failed.");
        }
        renderVision(result.data.analyses || []);
    }).catch(function (error) {
        visionBox.className = "panel-body vision-box";
        visionBox.innerHTML =
            '<div class="error-state"><strong>Vision analysis failed</strong>' +
            "<p>" + escapeHtml(error.message) + "</p></div>";
    });
}

function renderVision(analyses) {
    if (!analyses || analyses.length === 0) {
        visionBox.className = "panel-body vision-box";
        visionBox.innerHTML =
            '<div class="empty-state"><span class="empty-icon" aria-hidden="true">&#128065;</span>' +
            "<strong>No links to analyze</strong>" +
            "<p>This email has no links.</p></div>";
        return;
    }
    let cards = "";
    for (let i = 0; i < analyses.length; i++) {
        const item = analyses[i];
        if (item.error) {
            cards +=
                '<div class="vision-item vision-error">' +
                '<span class="vision-label">Link could not be captured</span>' +
                '<span class="vision-url">' + escapeHtml(item.url) + "</span>" +
                '<span class="vision-detail">' + escapeHtml(item.error) + "</span>" +
                "</div>";
            continue;
        }
        const verdict = String(item.verdict || "Unknown");
        const lower = verdict.toLowerCase();
        const vLabel = lower === "legitimate" ? "Legitimate" : "Phishing";
        const vSlug = lower === "legitimate" ? "legitimate" : "phishing";
        let pv = Number(item.phishing_probability);
        let lv = Number(item.legitimate_probability);
        if (isNaN(pv)) pv = 0;
        if (isNaN(lv)) lv = 0;
        cards +=
            '<div class="vision-item">' +
            '<div class="vision-shot">' +
            '<span class="vision-verdict vision-' + vSlug + '">' + vLabel + " " + pv.toFixed(1) + "%</span>" +
            '<img src="' + item.screenshot + '" alt="Screenshot of ' + escapeHtmlAttr(item.url) + '">' +
            '<span class="vision-overlay">' + escapeHtml(item.url) + "</span>" +
            "</div>" +
            '<div class="vision-content">' +
            '<span class="block-label">Analysis result</span>' +
            '<div class="meter-list">' +
            '<div class="meter-row"><div class="meter-top">' +
            '<span class="meter-name meter-phishing">Phishing</span>' +
            '<span class="meter-value">' + pv.toFixed(1) + "%</span>" +
            '</div><div class="meter-track"><div class="meter-fill meter-fill-phishing" style="width: ' + pv.toFixed(1) + '%;"></div></div></div>' +
            '<div class="meter-row"><div class="meter-top">' +
            '<span class="meter-name meter-ham">Legitimate</span>' +
            '<span class="meter-value">' + lv.toFixed(1) + "%</span>" +
            '</div><div class="meter-track"><div class="meter-fill meter-fill-ham" style="width: ' + lv.toFixed(1) + '%;"></div></div></div>' +
            "</div></div></div>";
    }
    visionBox.className = "panel-body vision-box";
    visionBox.innerHTML = '<div class="vision-grid">' + cards + "</div>";
}