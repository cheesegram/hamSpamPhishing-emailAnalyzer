const emailForm = document.getElementById("emailForm");
const emailText = document.getElementById("emailText");
const emailLinks = document.getElementById("emailLinks");
const resultBox = document.getElementById("resultBox");
const visionBox = document.getElementById("visionBox");
const analyzeButton = document.getElementById("analyzeButton");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function escapeHtmlAttr(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

const BLOCK_TAGS = {
    P: true, DIV: true, TR: true, LI: true,
    H1: true, H2: true, H3: true, H4: true, H5: true, H6: true,
    BLOCKQUOTE: true, SECTION: true, ARTICLE: true,
    HEADER: true, FOOTER: true, TABLE: true, UL: true, OL: true
};

function endsWithBreak(chunks) {
    for (let i = chunks.length - 1; i >= 0; i--) {
        const c = String(chunks[i] || "").trim();
        if (!c) continue;
        return /(<br\s*\/?>)$/i.test(c);
    }
    return true;
}

function linkifyText(text) {
    if (!text) return "";
    const urlPattern = /(https?:\/\/[^\s<>'\"()]+|www\.[^\s<>'\"()]+)/gi;
    let result = "";
    let lastIndex = 0;
    let match;
    while ((match = urlPattern.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        if (matchStart > lastIndex) {
            result += escapeHtml(text.slice(lastIndex, matchStart));
        }
        let rawUrl = match[0];
        let trailingPunct = "";
        const punctMatch = rawUrl.match(/[.,;:!?]+$/);
        if (punctMatch) {
            trailingPunct = punctMatch[0];
            rawUrl = rawUrl.slice(0, -trailingPunct.length);
        }
        let href = rawUrl;
        if (/^www\./i.test(href)) {
            href = "http://" + href;
        }
        harvestLink(href);
        result += '<a href="' + escapeHtmlAttr(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(rawUrl) + '</a>' + escapeHtml(trailingPunct);
        lastIndex = matchEnd;
    }
    if (lastIndex < text.length) {
        result += escapeHtml(text.slice(lastIndex));
    }
    return result;
}

function formatPlainText(text) {
    if (!text) return "";
    const lines = text.split(/\r\n|\r|\n/);
    const converted = lines.map(function (line) {
        return linkifyText(line);
    });
    return converted.join("<br>");
}

function sanitizePastedContent(pastedHtml, rawText) {
    if (!pastedHtml || typeof pastedHtml !== "string" || !pastedHtml.trim()) {
        return formatPlainText(rawText || "");
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(pastedHtml, "text/html");
        const root = doc.body;

        // Replace images with their alt or title text, otherwise remove them
        const images = root.querySelectorAll("img");
        images.forEach(function (img) {
            const alt = (img.getAttribute("alt") || img.getAttribute("title") || "").trim();
            if (alt) {
                img.parentNode.replaceChild(doc.createTextNode(" " + alt + " "), img);
            } else {
                img.remove();
            }
        });

        // Remove scripts, styles, embedded frames, forms, svg, canvas, audio, video
        const forbidden = root.querySelectorAll(
            "script, style, link, meta, iframe, object, embed, form, input, button, select, textarea, svg, canvas, audio, video"
        );
        forbidden.forEach(function (el) {
            el.remove();
        });

        const chunks = [];

        function walk(node) {
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const val = node.nodeValue || "";
                if (val.trim() === "") {
                    if (val.length > 0 && !endsWithBreak(chunks)) {
                        chunks.push(" ");
                    }
                } else {
                    const lines = val.split(/\r\n|\r|\n/);
                    if (lines.length > 1) {
                        lines.forEach(function (line, idx) {
                            if (idx > 0 && !endsWithBreak(chunks)) {
                                chunks.push("<br>");
                            }
                            const linked = linkifyText(line);
                            if (linked) {
                                chunks.push(linked);
                            }
                        });
                    } else {
                        chunks.push(linkifyText(val));
                    }
                }
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toUpperCase();

            if (tag === "BR") {
                chunks.push("<br>");
                return;
            }

            if (tag === "A") {
                const rawHref = (node.getAttribute("href") || "").trim();
                let validHref = "";
                if (/^https?:\/\//i.test(rawHref) || /^mailto:/i.test(rawHref)) {
                    validHref = rawHref;
                } else if (/^www\./i.test(rawHref)) {
                    validHref = "http://" + rawHref;
                }

                const textContent = (node.textContent || "").trim();

                if (validHref) {
                    harvestLink(validHref);
                    const displayText = textContent || validHref;
                    chunks.push(
                        '<a href="' + escapeHtmlAttr(validHref) + '" target="_blank" rel="noopener noreferrer">' +
                        escapeHtml(displayText) +
                        '</a>'
                    );
                } else if (textContent) {
                    chunks.push(escapeHtml(textContent));
                }
                return;
            }

            const isBlock = !!BLOCK_TAGS[tag];
            if (isBlock && chunks.length > 0 && !endsWithBreak(chunks)) {
                chunks.push("<br>");
            }

            const beforeLen = chunks.length;
            const children = Array.from(node.childNodes);
            for (let i = 0; i < children.length; i++) {
                walk(children[i]);
            }

            if (isBlock && chunks.length > beforeLen && !endsWithBreak(chunks)) {
                chunks.push("<br>");
            }
        }

        walk(root);

        let cleanHtml = chunks.join("");
        cleanHtml = cleanHtml.replace(/[ \t]{2,}/g, " ");
        cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");
        cleanHtml = cleanHtml.replace(/^(\s*<br\s*\/?>\s*)+|(\s*<br\s*\/?>\s*)+$/gi, "").trim();

        if (!cleanHtml) {
            return formatPlainText(rawText || "");
        }
        return cleanHtml;
    } catch (e) {
        return formatPlainText(rawText || "");
    }
}

function insertCleanContent(cleanHtml) {
    if (!cleanHtml) return;

    emailText.focus();
    const selection = window.getSelection();
    let range;
    if (selection && selection.rangeCount > 0 && emailText.contains(selection.anchorNode)) {
        range = selection.getRangeAt(0);
        range.deleteContents();
    } else {
        range = document.createRange();
        range.selectNodeContents(emailText);
        range.collapse(false);
    }

    try {
        const fragment = document.createRange().createContextualFragment(cleanHtml);
        const lastNode = fragment.lastChild;
        range.insertNode(fragment);
        if (lastNode && selection) {
            const nextRange = document.createRange();
            nextRange.setStartAfter(lastNode);
            nextRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(nextRange);
        }
    } catch (err) {
        emailText.innerHTML = cleanHtml;
    }

    harvestLinks();
}

emailText.addEventListener("paste", function (event) {
    const clipboardData = event.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const rawText = clipboardData.getData("text/plain") || "";
    const pastedHtml = clipboardData.getData("text/html") || "";

    if (!rawText && !pastedHtml) return;

    event.preventDefault();
    const cleanHtml = sanitizePastedContent(pastedHtml, rawText);
    insertCleanContent(cleanHtml);
});

emailText.addEventListener("drop", function (event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const rawText = dataTransfer.getData("text/plain") || "";
    const pastedHtml = dataTransfer.getData("text/html") || "";

    if (!rawText && !pastedHtml) return;

    event.preventDefault();
    const cleanHtml = sanitizePastedContent(pastedHtml, rawText);
    insertCleanContent(cleanHtml);
});

emailText.addEventListener("input", function () {
    harvestLinks();
});

emailText.addEventListener("click", function (event) {
    const anchor = event.target.closest("a");
    if (anchor && (event.ctrlKey || event.metaKey)) {
        window.open(anchor.href, "_blank", "noopener,noreferrer");
    }
});

const sampleChips = document.querySelectorAll(".sample-chip");

sampleChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
        const sampleText = chip.getAttribute("data-email");
        if (!sampleText) return;
        emailText.innerHTML = linkifyText(sampleText);
        harvestLinks();
    });
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
    let categoryConfidence = Number(confidence[badgeText]);
    if (isNaN(categoryConfidence)) categoryConfidence = 0;
    if (categoryConfidence < 0) categoryConfidence = 0;
    if (categoryConfidence > 100) categoryConfidence = 100;
    const categoryConfidenceLabel = categoryConfidence.toFixed(1) + "%";
    const meterNames = ["Ham", "Spam", "Phishing"];
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
        '<span class="badge-dot" aria-hidden="true"></span>' +
        badgeText + " " + categoryConfidenceLabel +
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
            continue;
        }
        const verdict = String(item.verdict || "Unknown");
        const lower = verdict.toLowerCase();
        const vLabel = lower === "legitimate" ? "Ham" : "Phishing";
        const vSlug = lower === "legitimate" ? "ham" : "phishing";
        let pv = Number(item.phishing_probability);
        let lv = Number(item.legitimate_probability);
        if (isNaN(pv)) pv = 0;
        if (isNaN(lv)) lv = 0;
        cards +=
            '<div class="vision-item">' +
            '<div class="vision-head">' +
            '<span class="vision-verdict vision-' + vSlug + '">' +
            '<span class="badge-dot" aria-hidden="true"></span>' +
            vLabel + " " + (vLabel === "Phishing" ? pv : lv).toFixed(1) + "%" +
            "</span>" +
            '<span class="result-meta">Website screenshot analysis</span>' +
            "</div>" +
            '<div class="vision-shot">' +
            '<img src="' + item.screenshot + '" alt="Screenshot of ' + escapeHtmlAttr(item.url) + '">' +
            "</div>" +
            '<div class="vision-content">' +
            '<div class="result-columns">' +
            '<div class="result-side">' +
            '<span class="block-label">Analysis result</span>' +
            '<div class="meter-list">' +
            '<div class="meter-row"><div class="meter-top">' +
            '<span class="meter-name meter-ham">Ham</span>' +
            '<span class="meter-value">' + lv.toFixed(1) + "%</span>" +
            '</div><div class="meter-track"><div class="meter-fill meter-fill-ham" style="width: ' + lv.toFixed(1) + '%;"></div></div></div>' +
            '<div class="meter-row"><div class="meter-top">' +
            '<span class="meter-name meter-phishing">Phishing</span>' +
            '<span class="meter-value">' + pv.toFixed(1) + "%</span>" +
            '</div><div class="meter-track"><div class="meter-fill meter-fill-phishing" style="width: ' + pv.toFixed(1) + '%;"></div></div></div>' +
            "</div></div>" +
            '<div class="result-main">' +
            '<span class="block-label">Gemini explanation</span>' +
            '<p class="explanation-text">' +
            escapeHtml(item.explanation || "No explanation provided.") +
            "</p></div></div></div></div>";
    }
    if (!cards) {
        visionBox.className = "panel-body vision-box";
        visionBox.innerHTML =
            '<div class="empty-state"><span class="empty-icon" aria-hidden="true">&#128065;</span>' +
            "<strong>No screenshots available</strong>" +
            "<p>The links could not be captured for analysis.</p></div>";
        return;
    }
    visionBox.className = "panel-body vision-box";
    visionBox.innerHTML = '<div class="vision-grid">' + cards + "</div>";
}