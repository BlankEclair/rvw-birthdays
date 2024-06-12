"use strict";

const WIKI_BASE = "https://rainverse.wiki";
const API_ENDPOINT = "https://rainverse.wiki/w/api.php";
const RAINVERSE_STORIES = ["Rain", "My Impossible Soulmate"];

/*** ERROR HANDLER ***/
let errorBox = document.querySelector("#errorBox");
let errorPre = document.querySelector("#errorPre");
function handleError(error) {
    let text = `${error.name}: ${error.message}`;
    if (error.stack) {
        text += `\n${error.stack}`;
    }

    if (errorPre.innerText) {
        errorPre.innerText += "\n---\n";
    }
    errorPre.innerText += text;

    errorBox.classList.remove("hide");
    throw error;
}

/*** STATUS INDICATOR ***/
let statusWrapper = document.querySelector("#statusWrapper");
let statusLabel = document.querySelector("label[for=status]");
function setStatus(text) {
    statusLabel.innerText = text;
}
function hideStatus() {
    statusWrapper.remove();
}

/*** BOILERPLATE ***/
async function getCategoryMemberContents(api, category) {
    let contents = new Map();

    let options = {
        action: "query",
        generator: "categorymembers",
        gcmtype: "page",
        gcmtitle: category,
        gcmlimit: "max",
        prop: "revisions",
        rvprop: "content",
        rvslots: "*",
    };
    let contOptions = {};
    while (true) {
        let data = await api.get({...options, ...contOptions});
        for (let page in data.query.pages) {
            page = data.query.pages[page];
            // Who needs proper continuation code when you could just check if both exist?
            if (!page.title || !page.revisions) {
                continue;
            }
            let title = page.title;
            let wikitext = page.revisions[0].slots.main.content;

            contents.set(title, wikitext);
        }

        if (!data.continue) {
            break;
        }
        contOptions = data.continue;
    }

    return contents;
}

// A primitive version of [[Module:Plain text]] because I'm too lazy to copy its code.
// One main difference from that module: This one converts <br> into \n, not ", "
function plainText(wikitext) {
    wikitext = wikitext.replaceAll(/<ref\s[^>]+\/>/g, "");
    wikitext = wikitext.replaceAll(/<ref(?:\s[^>]+)?>.+?<\/ref>/g, "");
    wikitext = wikitext.replaceAll(/<br ?\/?>/g, "\n");
    return wikitext;
}
// Best effort date parser...
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function parseDate(date) {
    let year, month, day, match;

    if (match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)) {
        // YYYY-mm-dd
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
    } else if (match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date)) {
        // dd-mm-YYYY
        year = parseInt(match[3], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[1], 10);
    } else if (match = /^(\d{1,2}),? ([a-z]+)(?:,? (\d{4}))?$/i.exec(date)) {
        // dd MMM, YYYY; dd MM
        year = parseInt(match[3], 10) || 1000;
        month = MONTH_NAMES.indexOf(match[2]) + 1;
        day = parseInt(match[1], 10);
    } else if (match = /^([a-z]+),? (\d{1,2})(?:,? (\d{4}))?$/i.exec(date)) {
        // MMM dd, YYYY; MMM dd
        year = parseInt(match[3], 10) || 1000;
        month = MONTH_NAMES.indexOf(match[1]) + 1;
        day = parseInt(match[2], 10);
    } else if (match = /^(\d{4}),? ([a-z]+),? (\d{1,2})$/i.exec(date)) {
        // YYYY MMM dd
        year = parseInt(match[1], 10);
        month = MONTH_NAMES.indexOf(match[2]) + 1;
        day = parseInt(match[3], 10);
    } else if (match = /^Released in (\d{4})$/.exec(date)) {
        // Released in YYYY
        // https://rainverse.wiki/wiki/Momokomo?oldid=21531
        year = parseInt(match[1], 10);
        month = 1;
        day = 1;
    } else {
        throw new Error(`parseDate(): Failed to parse date: ${JSON.stringify(date)}`);
    }

    if (year < 1000) {
        throw new RangeError(`parseDate(): Invalid year: ${year}`);
    }
    if (month < 1 || month > 12) {
        throw new RangeError(`parseDate(): Invalid month: ${month}`);
    }
    if (day < 1 || day > 31) {
        throw new RangeError(`parseDate(): Invalid day: ${day}`);
    }

    return new Date(year, month - 1, day);
}

function extractDataFromWikitext(wikitext) {
    let fullName = /\|\s*full name\s*=([\s\S]*?)\n\s*(?:\||}})/.exec(wikitext);
    if (fullName) {
        fullName = plainText(fullName[1]).replace(/^[\s\S]*\n/, "").replace(/\(.+/, "").trim();
    }

    let dateString = /\|\s*birthDate\s*=([\s\S]*?)\n\s*(?:\||}})/.exec(wikitext);
    let dateDate = null;
    if (dateString) {
        dateString = plainText(dateString[1]).trim();
    }
    if (dateString) {
        dateDate = parseDate(dateString);
    }

    return {fullName, dateString, dateDate};
}
async function generateTable(api, contents) {
    let sortedContents = [];
    for (let [title, {stories, wikitext}] of contents.entries()) {
        sortedContents.push({
            title,
            stories,
            ...extractDataFromWikitext(wikitext),
        });
    }
    sortedContents.sort((a, b) => (b.dateDate || Number.MIN_SAFE_INTEGER) - (a.dateDate || Number.MIN_SAFE_INTEGER));

    let wikitext = '{| class="wikitable sortable"\n';
    wikitext += "! Character\n";
    wikitext += "! From comics\n";
    wikitext += "! Date of birth\n";
    for (let {title, stories, fullName, dateString, dateDate} of sortedContents) {
        wikitext += "|-\n";
        wikitext += `| [[${title}|${fullName || title}]]\n`;
        wikitext += `| ${stories.join(", ")}\n`;
        wikitext += `| data-sort-value=${dateDate ? dateDate.getTime() : Number.MIN_SAFE_INTEGER} | {{#formatdate: ${dateString || ""} | dmy}}\n`;
    }
    wikitext += "|}";

    let data = await api.get({
        action: "parse",
        text: wikitext,
        prop: ["text", "headhtml"],
        useskin: "vector",
        contentmodel: "wikitext",
        debug: (new URLSearchParams(window.location.search)).get("debug") || undefined,
    });
    return data.parse;
}

/*** MAIN ***/
async function main() {
    let api = new API(API_ENDPOINT);
    let contents = new Map();

    for (let rainverseStory of RAINVERSE_STORIES) {
        setStatus(`Fetching characters for ${rainverseStory}...`);
        let categoryContents = await getCategoryMemberContents(api, `Category:${rainverseStory} characters`);

        for (let [title, wikitext] of categoryContents.entries()) {
            let titleContents = contents.get(title);
            if (!titleContents) {
                titleContents = {stories: [], wikitext};
                contents.set(title, titleContents);
            }

            titleContents.stories.push(rainverseStory);
        }
    }

    setStatus("Creating table...");
    let oldHead = document.head;
    let oldBody = document.body;
    let parse = await generateTable(api, contents);

    // Welcome to ✨ War Crimes with Claire ✨
    // Fix license link before we undergo metamorphosis
    let licenseLink = document.querySelector("#licenseLink");
    licenseLink.href = licenseLink.href;
    // Undergo metamorphosis
    document.documentElement.innerHTML = parse.headhtml.replace("<head>", `<head><base href="${WIKI_BASE}">`).replace(/<link rel="icon" .+?>/, "");
    // Remove MediaWiki title
    document.head.querySelector("title").remove();
    // Activate Javascript (no, script.cloneNode(true) does not work)
    for (let script of document.querySelectorAll("script")) {
        let newScript = document.createElement("script");
        for (let attr of script.attributes) {
            newScript.setAttribute(attr.name, attr.value);
        }
        newScript.append(...script.childNodes);
        script.replaceWith(newScript);
    }
    document.head.append(...oldHead.children);

    hideStatus();
    document.body.append(...oldBody.children);

    let div = document.createElement("div");
    div.id = "mw-content-text";
    div.className = "mw-body-content";
    div.innerHTML = parse.text;
    document.body.append(div);
}
main().catch(handleError);
