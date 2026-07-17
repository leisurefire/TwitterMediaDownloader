// ==UserScript==
// @name               Twitter/X Media Downloader
// @name:zh            Twitter 媒体下载
// @description        Download videos/pictures with one click | Automatically package them into a ZIP file for batch download
// @description:zh     一键下载视频/图片,支持批量下载时自动打包为一个ZIP文件下载.支持新版API接口

// @author             goemon2017,天音,Tiande,人民的勤务员,leisurefire
// @namespace          https://github.com/leisurefire/TwitterMediaDownloader
// @supportURL         https://github.com/leisurefire/TwitterMediaDownloader/issues
// @homepageURL        https://github.com/leisurefire/TwitterMediaDownloader
// @homepage           https://github.com/leisurefire/TwitterMediaDownloader
// @license            MIT
// @icon               https://raw.githubusercontent.com/ChinaGodMan/UserScriptsHistory/main/scriptsIcon/x.svg
// @grant              GM_registerMenuCommand
// @grant              GM_setValue
// @grant              GM_getValue
// @grant              GM_download
// @match              https://x.com/*
// @match              https://twitter.com/*
// @version            2026.07.16.001
// @downloadURL https://raw.githubusercontent.com/leisurefire/TwitterMediaDownloader/refs/heads/main/script.js
// @updateURL https://raw.githubusercontent.com/leisurefire/TwitterMediaDownloader/refs/heads/main/script.js
// ==/UserScript==

//! 修复代码来自:goemon2017:https://greasyfork.org/scripts/423001/discussions/296626#comment-589742

/* jshint esversion: 8 */
const filename =
    "twitter_{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}";
const TMD = (function () {
    let lang, host, history, show_sensitive, is_tweetdeck;
    return {
        init: async function () {
            GM_registerMenuCommand(
                (this.language[navigator.language] || this.language.en).settings,
                this.settings
            );
            GM_registerMenuCommand("Export History (Markdown)", async () =>
                this.exportHistory()
            );
            lang =
                this.language[document.querySelector("html").lang] || this.language.en;
            host = location.hostname;
            is_tweetdeck = host.indexOf("tweetdeck") >= 0;
            history = this.storage_obsolete();
            if (history.length) {
                this.storage(history);
                this.storage_obsolete(true);
            } else history = await this.storage();
            show_sensitive = GM_getValue("show_sensitive", false);
            document.head.insertAdjacentHTML(
                "beforeend",
                "<style>" + this.css + (show_sensitive ? this.css_ss : "") + "</style>"
            );
            let observer = new MutationObserver((ms) =>
                ms.forEach((m) => m.addedNodes.forEach((node) => this.detect(node)))
            );
            observer.observe(document.body, { childList: true, subtree: true });
            this.addMediaPageButton();
        },
        exportHistory: async function () {
            try {
                const history = await GM_getValue("download_history", []);
                if (!history || !Array.isArray(history) || history.length === 0) {
                    return;
                }
                const markdownContent =
                    "# Twitter/X Media Downloader history\n\n" +
                    (
                        await Promise.all(history.map((id) => this.generateMarkdown(id)))
                    ).join("\n");
                const blob = new Blob([markdownContent], {
                    type: "text/markdown;charset=utf-8",
                });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `twitter_download_history_(${history.length}).md`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            } catch (error) {
                console.error(
                    "An error occurred while exporting Markdown history:",
                    error
                );
                alert(
                    "An error occurred while exporting Markdown history, please check the console for details."
                );
            }
        },
        generateMarkdown: async function (tweet_id, fetch = true) {
            if (!fetch)
                return `[Tweet] - ${tweet_id} (https://x.com/i/web/status/${tweet_id})`;
            let json = await this.fetchJson(tweet_id);
            let tweet =
                json.quoted_status_result?.result?.legacy?.media ||
                json.quoted_status_result?.result?.legacy ||
                json.legacy;
            let user = json.core.user_results.result.legacy;
            let user_name = user.name.replace(
                /([\\/|*?:"\u200b-\u200d\u2060\ufeff]|🔞)/g,
                (v) => invalid_chars[v]
            );
            let full_text = tweet.full_text
                .split("\n")
                .join(" ")
                .replace(/\s*https:\/\/t\.co\/\w+/g, "")
                .replace(
                    /[\\/|<>*?:"\u200b-\u200d\u2060\ufeff]/g,
                    (v) => invalid_chars[v]
                );
            return `[${user_name} (@${user.screen_name})](https://x.com/i/web/status/${tweet_id})\n>  ${full_text}\n`;
        },
        detect: function (node) {
            this.addMediaPageButton();
            let article =
                (node.tagName == "ARTICLE" && node) ||
                (node.tagName == "DIV" &&
                    (node.querySelector("article") || node.closest("article")));
            if (article) this.addButtonTo(article);
            let listitems =
                (node.tagName == "LI" &&
                    node.getAttribute("role") == "listitem" && [node]) ||
                (node.tagName == "DIV" && node.querySelectorAll('li[role="listitem"]'));
            if (listitems) this.addButtonToMedia(listitems);
        },
        addMediaPageButton: function () {
            let match = location.pathname.match(/^\/([^/]+)\/media\/?$/);
            let existing = document.querySelector(".tmd-download-all-container");
            if (!match) {
                if (existing) existing.remove();
                return;
            }
            if (existing) {
                if (existing.dataset.path === location.pathname) return;
                existing.remove();
            }
            let tab = document.querySelector(`a[href="/${match[1]}/media"][role="tab"]`);
            let tabItem = tab?.parentElement;
            if (!tabItem || !tabItem.parentNode) return;

            // X wraps every tab link in a layout item. Clone and insert the whole
            // item so the batch action cannot overlap the original media tab.
            let item = tabItem.cloneNode(true);
            let btn = item.querySelector('a[role="tab"]');
            if (!btn) return;
            item.classList.add("tmd-download-all-container");
            item.dataset.path = location.pathname;
            btn.removeAttribute("href");
            btn.removeAttribute("aria-selected");
            btn.classList.add("tmd-download-all");
            btn.setAttribute("role", "button");
            btn.setAttribute("tabindex", "0");
            let span = Array.from(btn.querySelectorAll("span")).find(
                (node) => !node.querySelector("span")
            );
            if (span) span.textContent = lang.download_all;
            let indicator = btn.querySelector('[style*="background-color"]');
            if (indicator) indicator.remove();
            let activate = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.downloadAllMedia(btn);
            };
            btn.addEventListener("click", activate);
            btn.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") activate(event);
            });
            tabItem.parentNode.insertBefore(item, tabItem.nextSibling);
        },
        downloadAllMedia: async function (btn) {
            if (btn.classList.contains("loading")) return;
            btn.classList.add("loading");
            let originalTitle = btn.title;
            let label = Array.from(btn.querySelectorAll("span")).find(
                (node) => !node.querySelector("span")
            );
            let originalLabel = label?.textContent;
            try {
                let ids = new Set();
                let stable = 0;
                let previousSize = -1;
                while (stable < 5) {
                    document.querySelectorAll('article a[href*="/status/"]').forEach((a) => {
                        let id = a.href.match(/\/status\/(\d+)/)?.[1];
                        if (id) ids.add(id);
                    });
                    stable = ids.size === previousSize ? stable + 1 : 0;
                    previousSize = ids.size;
                    btn.title = `${lang.collecting}: ${ids.size}`;
                    if (label) label.textContent = `${lang.collecting}: ${ids.size}`;
                    window.scrollTo(0, document.body.scrollHeight);
                    await this.sleep(1200);
                }
                let results = await this.mapLimit([...ids], 2, async (id) => {
                    try { return await this.createDownloadTasks(id); }
                    catch (error) { console.error("TMD batch parse failed", id, error); return []; }
                });
                let tasks = results.flat();
                if (!tasks.length) {
                    alert(lang.no_media);
                    return;
                }
                if (!confirm(lang.download_all_confirm.replace("{count}", tasks.length))) return;
                await this.downloadTasks(tasks, btn);
                alert(lang.download_all_done.replace("{count}", tasks.length));
            } catch (error) {
                console.error("TMD batch download failed", error);
                alert(lang.download_all_failed.replace("{error}", error?.message || error));
            } finally {
                btn.classList.remove("loading");
                btn.title = originalTitle;
                if (label) label.textContent = originalLabel;
            }
        },
        createDownloadTasks: async function (status_id) {
            let out = (await GM_getValue("filename", filename)).split("\n").join("");
            let json = await this.fetchJson(status_id);
            let tweet = json.quoted_status_result?.result?.legacy?.media ||
                json.quoted_status_result?.result?.legacy || json.legacy;
            let user = json.core.user_results.result.legacy;
            let invalid = /[\\/|<>*?:"\u200b-\u200d\u2060\ufeff]/g;
            let datetime = out.match(/\{date-time(-local)?:[^{}]+\}/)
                ? out.match(/\{date-time(?:-local)?:([^{}]+)\}/)[1].replace(invalid, "-")
                : "YYYYMMDD-hhmmss";
            let medias = tweet.extended_entities?.media;
            if (!Array.isArray(medias)) return [];
            return medias.map((media, i) => {
                let url = media.type === "photo" ? media.media_url_https + ":orig" :
                    media.video_info.variants.filter((v) => v.content_type === "video/mp4")
                        .sort((a, b) => b.bitrate - a.bitrate)[0]?.url;
                if (!url) return null;
                let file = url.split("/").pop().split(/[:?]/).shift();
                let info = {
                    "status-id": status_id, "user-name": user.name.replace(invalid, "-"),
                    "user-id": user.screen_name, "date-time": this.formatDate(tweet.created_at, datetime),
                    "date-time-local": this.formatDate(tweet.created_at, datetime, true),
                    "full-text": tweet.full_text.replace(/\s*https:\/\/t\.co\/\w+/g, "").replace(invalid, "-"),
                    "file-name": file.split(".").shift(), "file-ext": file.split(".").pop(),
                    "file-type": media.type.replace("animated_", "")
                };
                let name = (out.replace(/\.?\{file-ext\}/, "") +
                    (medias.length > 1 && !out.match("{file-name}") ? "-" + i : "") + ".{file-ext}")
                    .replace(/\{([^{}:]+)(:[^{}]+)?\}/g, (m, key) => info[key]);
                return { url, name };
            }).filter(Boolean);
        },
        mapLimit: async function (items, limit, worker) {
            let results = new Array(items.length), next = 0;
            await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
                while (next < items.length) { let i = next++; results[i] = await worker(items[i]); }
            }));
            return results;
        },
        sleep: function (ms) { return new Promise((resolve) => setTimeout(resolve, ms)); },
        downloadTasks: async function (tasks, btn) {
            let done = 0;
            await this.mapLimit(tasks, 4, (task) => new Promise((resolve) => {
                let attempt = (retry = 0) => GM_download({
                    url: task.url, name: task.name,
                    onload: () => { btn.title = `${++done}/${tasks.length}`; resolve(); },
                    onerror: async (error) => {
                        let rateLimited = /429|rate/i.test(JSON.stringify(error));
                        if (rateLimited && retry < 6) {
                            let wait = Math.min(60000, 5000 * Math.pow(2, retry));
                            btn.title = `${lang.rate_limited} (${Math.ceil(wait / 1000)}s)`;
                            await this.sleep(wait); attempt(retry + 1);
                        } else { console.error("TMD batch download failed", task, error); resolve(); }
                    }
                });
                attempt();
            }));
        },
        addButtonTo: function (article) {
            if (article.dataset.detected) return;
            article.dataset.detected = "true";
            let media_selector = [
                'a[href*="/photo/1"]',
                'div[role="progressbar"]',
                'button[data-testid="playButton"]',
                'a[href="/settings/content_you_see"]', //hidden content
                "div.media-image-container", // for tweetdeck
                "div.media-preview-container", // for tweetdeck
                'div[aria-labelledby]>div:first-child>div[role="button"][tabindex="0"]', //for audio (experimental)
            ];
            let media = article.querySelector(media_selector.join(","));
            if (media) {
                let status_id = article
                    .querySelector('a[href*="/status/"]')
                    .href.split("/status/")
                    .pop()
                    .split("/")
                    .shift();
                let btn_group = article.querySelector(
                    'div[role="group"]:last-of-type, ul.tweet-actions, ul.tweet-detail-actions'
                );
                let btn_share = Array.from(
                    btn_group.querySelectorAll(
                        ":scope>div>div, li.tweet-action-item>a, li.tweet-detail-action-item>a"
                    )
                ).pop().parentNode;
                let btn_down = btn_share.cloneNode(true);
                btn_down.querySelector("button").removeAttribute("disabled");
                if (is_tweetdeck) {
                    btn_down.firstElementChild.innerHTML =
                        '<svg viewBox="0 0 24 24" style="width: 18px; height: 18px;">' +
                        this.svg +
                        "</svg>";
                    btn_down.firstElementChild.removeAttribute("rel");
                    btn_down.classList.replace("pull-left", "pull-right");
                } else {
                    btn_down.querySelector("svg").innerHTML = this.svg;
                }
                let is_exist = history.indexOf(status_id) >= 0;
                this.status(btn_down, "tmd-down");
                this.status(
                    btn_down,
                    is_exist ? "completed" : "download",
                    is_exist ? lang.completed : lang.download
                );
                btn_group.insertBefore(btn_down, btn_share.nextSibling);
                btn_down.onclick = () => this.click(btn_down, status_id, is_exist);
                if (show_sensitive) {
                    let btn_show = article.querySelector(
                        'div[aria-labelledby] div[role="button"][tabindex="0"]:not([data-testid]) > div[dir] > span > span'
                    );
                    if (btn_show) btn_show.click();
                }
            }
            let imgs = article.querySelectorAll('a[href*="/photo/"]');
            if (imgs.length > 1) {
                let status_id = article
                    .querySelector('a[href*="/status/"]')
                    .href.split("/status/")
                    .pop()
                    .split("/")
                    .shift();
                let btn_group = article.querySelector('div[role="group"]:last-of-type');
                let btn_share = Array.from(
                    btn_group.querySelectorAll(":scope>div>div")
                ).pop().parentNode;
                imgs.forEach((img) => {
                    let index = img.href.split("/status/").pop().split("/").pop();
                    let is_exist = history.indexOf(status_id) >= 0;
                    let btn_down = document.createElement("div");
                    btn_down.innerHTML =
                        '<div><div><svg viewBox="0 0 24 24" style="width: 18px; height: 18px;">' +
                        this.svg +
                        "</svg></div></div>";
                    btn_down.classList.add("tmd-down", "tmd-img");
                    this.status(btn_down, "download");
                    img.parentNode.appendChild(btn_down);
                    btn_down.onclick = (e) => {
                        e.preventDefault();
                        this.click(btn_down, status_id, is_exist, index);
                    };
                });
            }
        },
        addButtonToMedia: function (listitems) {
            listitems.forEach((li) => {
                if (li.dataset.detected) return;
                li.dataset.detected = "true";
                let status_id = li
                    .querySelector('a[href*="/status/"]')
                    .href.split("/status/")
                    .pop()
                    .split("/")
                    .shift();
                let is_exist = history.indexOf(status_id) >= 0;
                let btn_down = document.createElement("div");
                btn_down.innerHTML =
                    '<div><div><svg viewBox="0 0 24 24" style="width: 18px; height: 18px;">' +
                    this.svg +
                    "</svg></div></div>";
                btn_down.classList.add("tmd-down", "tmd-media");
                this.status(
                    btn_down,
                    is_exist ? "completed" : "download",
                    is_exist ? lang.completed : lang.download
                );
                li.appendChild(btn_down);
                btn_down.onclick = () => this.click(btn_down, status_id, is_exist);
            });
        },
        click: async function (btn, status_id, is_exist, index) {
            if (btn.classList.contains("loading")) return;
            this.status(btn, "loading");
            let out = (await GM_getValue("filename", filename)).split("\n").join("");
            let save_history = await GM_getValue("save_history", true);
            let json = await this.fetchJson(status_id);
            let tweet =
                json.quoted_status_result?.result?.legacy?.media || //此媒体存在,属于引用推文
                json.quoted_status_result?.result?.legacy ||
                json.legacy;
            let user = json.core.user_results.result.legacy;
            let invalid_chars = {
                "\\": "＼",
                "/": "／",
                "|": "｜",
                "<": "＜",
                ">": "＞",
                ":": "：",
                "*": "＊",
                "?": "？",
                '"': "＂",
                "\u200b": "",
                "\u200c": "",
                "\u200d": "",
                "\u2060": "",
                "\ufeff": "",
                "🔞": "",
            };
            let datetime = out.match(/\{date-time(-local)?:[^{}]+\}/)
                ? out
                    .match(/\{date-time(?:-local)?:([^{}]+)\}/)[1]
                    .replace(/[\\/|<>*?:"]/g, (v) => invalid_chars[v])
                : "YYYYMMDD-hhmmss";
            let info = {};
            info["status-id"] = status_id;
            info["user-name"] = user.name.replace(
                /([\\/|*?:"\u200b-\u200d\u2060\ufeff]|🔞)/g,
                (v) => invalid_chars[v]
            );
            info["user-id"] = user.screen_name;
            info["date-time"] = this.formatDate(tweet.created_at, datetime);
            info["date-time-local"] = this.formatDate(
                tweet.created_at,
                datetime,
                true
            );
            info["full-text"] = tweet.full_text
                .split("\n")
                .join(" ")
                .replace(/\s*https:\/\/t\.co\/\w+/g, "")
                .replace(
                    /[\\/|<>*?:"\u200b-\u200d\u2060\ufeff]/g,
                    (v) => invalid_chars[v]
                );
            let medias = tweet.extended_entities && tweet.extended_entities.media;
            if (json?.card) {
                this.status(
                    btn,
                    "failed",
                    "This tweet contains a link, which is not supported by this script."
                );
                return;
            }
            if (!Array.isArray(medias)) {
                this.status(btn, "failed", "MEDIA_NOT_FOUND");
                return;
            }
            if (index) medias = [medias[index - 1]];
            if (medias.length > 0) {
                let tasks = medias.map((media, i) => {
                    info.url =
                        media.type == "photo"
                            ? media.media_url_https + ":orig"
                            : media.video_info.variants
                                .filter((n) => n.content_type == "video/mp4")
                                .sort((a, b) => b.bitrate - a.bitrate)[0].url;
                    info.file = info.url.split("/").pop().split(/[:?]/).shift();
                    info["file-name"] = info.file.split(".").shift();
                    info["file-ext"] = info.file.split(".").pop();
                    info["file-type"] = media.type.replace("animated_", "");
                    info.out = (
                        out.replace(/\.?\{file-ext\}/, "") +
                        ((medias.length > 1 || index) && !out.match("{file-name}")
                            ? "-" + (index ? index - 1 : i)
                            : "") +
                        ".{file-ext}"
                    ).replace(/\{([^{}:]+)(:[^{}]+)?\}/g, (match, name) => info[name]);
                    return { url: info.url, name: info.out };
                });
                this.downloader.add(tasks, btn, save_history, is_exist, status_id);
            } else {
                this.status(btn, "failed", "MEDIA_NOT_FOUND");
            }
        },
        downloader: (function () {
            let tasks = [],
                thread = 0,
                failed = 0,
                notifier,
                has_failed = false;
            return {
                add: function (taskList, btn, save_history, is_exist, status_id) {
                    tasks.push(...taskList);
                    let completedCount = 0;
                    let hasError = false;

                    taskList.forEach((task) => {
                        thread++;
                        this.update();

                        GM_download({
                            url: task.url,
                            name: task.name,
                            onload: () => {
                                thread--;
                                tasks = tasks.filter((t) => t.url !== task.url);
                                completedCount++;

                                // Only mark as completed and save history after all files are done
                                if (completedCount === taskList.length && !hasError) {
                                    this.status(btn, "completed", lang.completed);
                                    if (save_history && !is_exist) {
                                        history.push(status_id);
                                        this.storage(status_id);
                                    }
                                }
                                this.update();
                            },
                            onerror: (result) => {
                                thread--;
                                failed++;
                                hasError = true;
                                tasks = tasks.filter((t) => t.url !== task.url);
                                this.status(btn, "failed", result.details.current);
                                this.update();
                            },
                        });
                    });
                },
                status: function (btn, css, title, style) {
                    if (css) {
                        btn.classList.remove("download", "completed", "loading", "failed");
                        btn.classList.add(css);
                    }
                    if (title) btn.title = title;
                    if (style) btn.style.cssText = style;
                },
                storage: async function (value) {
                    let data = await GM_getValue("download_history", []);
                    let data_length = data.length;
                    if (value) {
                        if (Array.isArray(value)) data = data.concat(value);
                        else if (data.indexOf(value) < 0) data.push(value);
                    } else return data;
                    if (data.length > data_length) GM_setValue("download_history", data);
                },
                update: function () {
                    if (!notifier) {
                        notifier = document.createElement("div");
                        notifier.title = "Twitter Media Downloader";
                        notifier.classList.add("tmd-notifier");
                        notifier.innerHTML = "<label>0</label>|<label>0</label>";
                        document.body.appendChild(notifier);
                    }
                    if (failed > 0 && !has_failed) {
                        has_failed = true;
                        notifier.innerHTML += "|";
                        let clear = document.createElement("label");
                        notifier.appendChild(clear);
                        clear.onclick = () => {
                            notifier.innerHTML = "<label>0</label>|<label>0</label>";
                            failed = 0;
                            has_failed = false;
                            this.update();
                        };
                    }
                    notifier.firstChild.innerText = thread;
                    notifier.firstChild.nextElementSibling.innerText =
                        tasks.length - thread - failed;
                    if (failed > 0) notifier.lastChild.innerText = failed;
                    if (thread > 0 || tasks.length > 0 || failed > 0)
                        notifier.classList.add("running");
                    else notifier.classList.remove("running");
                },
            };
        })(),
        status: function (btn, css, title, style) {
            if (css) {
                btn.classList.remove("download", "completed", "loading", "failed");
                btn.classList.add(css);
            }
            if (title) btn.title = title;
            if (style) btn.style.cssText = style;
        },
        settings: async function () {
            const $element = (parent, tag, style, content, css) => {
                let el = document.createElement(tag);
                if (style) el.style.cssText = style;
                if (typeof content !== "undefined") {
                    if (tag == "input") {
                        if (content == "checkbox") el.type = content;
                        else el.value = content;
                    } else el.innerHTML = content;
                }
                if (css) css.split(" ").forEach((c) => el.classList.add(c));
                parent.appendChild(el);
                return el;
            };
            let wapper = $element(
                document.body,
                "div",
                "position: fixed; left: 0px; top: 0px; width: 100%; height: 100%; background-color: #0009; z-index: 10;"
            );
            let wapper_close;
            wapper.onmousedown = (e) => {
                wapper_close = e.target == wapper;
            };
            wapper.onmouseup = (e) => {
                if (wapper_close && e.target == wapper) wapper.remove();
            };
            let dialog = $element(
                wapper,
                "div",
                "position: absolute; left: 50%; top: 50%; transform: translateX(-50%) translateY(-50%); width: fit-content; width: -moz-fit-content; background-color: #f3f3f3; border: 1px solid #ccc; border-radius: 10px; color: black;"
            );
            let title = $element(
                dialog,
                "h3",
                "margin: 10px 20px;",
                lang.dialog.title
            );
            let options = $element(
                dialog,
                "div",
                "margin: 10px; border: 1px solid #ccc; border-radius: 5px;"
            );
            let save_history_label = $element(
                options,
                "label",
                "display: block; margin: 10px;",
                lang.dialog.save_history
            );
            let save_history_input = $element(
                save_history_label,
                "input",
                "float: left;",
                "checkbox"
            );
            save_history_input.checked = await GM_getValue("save_history", true);
            save_history_input.onchange = () => {
                GM_setValue("save_history", save_history_input.checked);
            };
            let clear_history = $element(
                save_history_label,
                "label",
                "display: inline-block; margin: 0 10px; color: blue;",
                lang.dialog.clear_history
            );
            clear_history.onclick = () => {
                if (confirm(lang.dialog.clear_confirm)) {
                    history = [];
                    GM_setValue("download_history", []);
                }
            };
            let show_sensitive_label = $element(
                options,
                "label",
                "display: block; margin: 10px;",
                lang.dialog.show_sensitive
            );
            let show_sensitive_input = $element(
                show_sensitive_label,
                "input",
                "float: left;",
                "checkbox"
            );
            show_sensitive_input.checked = await GM_getValue("show_sensitive", false);
            show_sensitive_input.onchange = () => {
                show_sensitive = show_sensitive_input.checked;
                GM_setValue("show_sensitive", show_sensitive);
            };
            let filename_div = $element(
                dialog,
                "div",
                "margin: 10px; border: 1px solid #ccc; border-radius: 5px;"
            );
            let filename_label = $element(
                filename_div,
                "label",
                "display: block; margin: 10px 15px;",
                lang.dialog.pattern
            );
            let filename_input = $element(
                filename_label,
                "textarea",
                "display: block; min-width: 500px; max-width: 500px; min-height: 100px; font-size: inherit; background: white; color: black;",
                await GM_getValue("filename", filename)
            );
            let filename_tags = $element(
                filename_div,
                "label",
                "display: table; margin: 10px;",
                `
<span class="tmd-tag" title="user name">{user-name}</span>
<span class="tmd-tag" title="The user name after @ sign.">{user-id}</span>
<span class="tmd-tag" title="example: 1234567890987654321">{status-id}</span>
<span class="tmd-tag" title="{date-time} : Posted time in UTC.\n{date-time-local} : Your local time zone.\n\nDefault:\nYYYYMMDD-hhmmss => 20201231-235959\n\nExample of custom:\n{date-time:DD-MMM-YY hh.mm} => 31-DEC-21 23.59">{date-time}</span><br>
<span class="tmd-tag" title="Text content in tweet.">{full-text}</span>
<span class="tmd-tag" title="Type of &#34;video&#34; or &#34;photo&#34; or &#34;gif&#34;.">{file-type}</span>
<span class="tmd-tag" title="Original filename from URL.">{file-name}</span>
`
            );
            filename_input.selectionStart = filename_input.value.length;
            filename_tags.querySelectorAll(".tmd-tag").forEach((tag) => {
                tag.onclick = () => {
                    let ss = filename_input.selectionStart;
                    let se = filename_input.selectionEnd;
                    filename_input.value =
                        filename_input.value.substring(0, ss) +
                        tag.innerText +
                        filename_input.value.substring(se);
                    filename_input.selectionStart = ss + tag.innerText.length;
                    filename_input.selectionEnd = ss + tag.innerText.length;
                    filename_input.focus();
                };
            });
            let btn_save = $element(
                title,
                "label",
                "float: right;",
                lang.dialog.save,
                "tmd-btn"
            );
            btn_save.onclick = async () => {
                await GM_setValue("filename", filename_input.value);
                wapper.remove();
            };
        },
        fetchJson: async function (status_id, retry = 0) {
            let base_url = `https://${host}/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId`;
            let variables = {
                tweetId: status_id,
                with_rux_injections: false,
                includePromotedContent: true,
                withCommunity: true,
                withQuickPromoteEligibilityTweetFields: true,
                withBirdwatchNotes: true,
                withVoice: true,
                withV2Timeline: true,
            };
            let features = {
                articles_preview_enabled: true,
                c9s_tweet_anatomy_moderator_badge_enabled: true,
                communities_web_enable_tweet_community_results_fetch: false,
                creator_subscriptions_quote_tweet_preview_enabled: false,
                creator_subscriptions_tweet_preview_api_enabled: false,
                freedom_of_speech_not_reach_fetch_enabled: true,
                graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                longform_notetweets_consumption_enabled: false,
                longform_notetweets_inline_media_enabled: true,
                longform_notetweets_rich_text_read_enabled: false,
                premium_content_api_read_enabled: false,
                profile_label_improvements_pcf_label_in_post_enabled: true,
                responsive_web_edit_tweet_api_enabled: false,
                responsive_web_enhance_cards_enabled: false,
                responsive_web_graphql_exclude_directive_enabled: false,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                responsive_web_graphql_timeline_navigation_enabled: false,
                responsive_web_grok_analysis_button_from_backend: false,
                responsive_web_grok_analyze_button_fetch_trends_enabled: false,
                responsive_web_grok_analyze_post_followups_enabled: false,
                responsive_web_grok_image_annotation_enabled: false,
                responsive_web_grok_share_attachment_enabled: false,
                responsive_web_grok_show_grok_translated_post: false,
                responsive_web_jetfuel_frame: false,
                responsive_web_media_download_video_enabled: false,
                responsive_web_twitter_article_tweet_consumption_enabled: true,
                rweb_tipjar_consumption_enabled: true,
                rweb_video_screen_enabled: false,
                standardized_nudges_misinfo: true,
                tweet_awards_web_tipping_enabled: false,
                tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                tweetypie_unmention_optimization_enabled: false,
                verified_phone_label_enabled: false,
                view_counts_everywhere_api_enabled: true,
            };
            let url = encodeURI(
                `${base_url}?variables=${JSON.stringify(
                    variables
                )}&features=${JSON.stringify(features)}`
            );
            let cookies = this.getCookie();
            let headers = {
                authorization:
                    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
                "x-twitter-active-user": "yes",
                "x-twitter-client-language": cookies.lang,
                "x-csrf-token": cookies.ct0,
            };
            if (cookies.ct0.length == 32) headers["x-guest-token"] = cookies.gt;
            let response = await fetch(url, { headers: headers });
            if (response.status === 429 && retry < 6) {
                let retryAfter = Number(response.headers.get("retry-after"));
                let reset = Number(response.headers.get("x-rate-limit-reset"));
                let wait = retryAfter ? retryAfter * 1000 :
                    reset ? Math.max(1000, reset * 1000 - Date.now()) :
                    Math.min(60000, 5000 * Math.pow(2, retry));
                await this.sleep(wait);
                return this.fetchJson(status_id, retry + 1);
            }
            if (!response.ok) throw new Error(`Twitter API HTTP ${response.status}`);
            let tweet_detail = await response.json();
            let tweet_result = tweet_detail.data.tweetResult.result;
            return tweet_result.tweet || tweet_result;
        },
        getCookie: function (name) {
            let cookies = {};
            document.cookie
                .split(";")
                .filter((n) => n.indexOf("=") > 0)
                .forEach((n) => {
                    n.replace(/^([^=]+)=(.+)$/, (match, name, value) => {
                        cookies[name.trim()] = value.trim();
                    });
                });
            return name ? cookies[name] : cookies;
        },
        storage: async function (value) {
            let data = await GM_getValue("download_history", []);
            let data_length = data.length;
            if (value) {
                if (Array.isArray(value)) data = data.concat(value);
                else if (data.indexOf(value) < 0) data.push(value);
            } else return data;
            if (data.length > data_length) GM_setValue("download_history", data);
        },
        storage_obsolete: function (is_remove) {
            let data = JSON.parse(localStorage.getItem("history") || "[]");
            if (is_remove) localStorage.removeItem("history");
            else return data;
        },
        formatDate: function (i, o, tz) {
            let d = new Date(i);
            if (tz) d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            let m = [
                "JAN",
                "FEB",
                "MAR",
                "APR",
                "MAY",
                "JUN",
                "JUL",
                "AUG",
                "SEP",
                "OCT",
                "NOV",
                "DEC",
            ];
            let v = {
                YYYY: d.getUTCFullYear().toString(),
                YY: d.getUTCFullYear().toString(),
                MM: d.getUTCMonth() + 1,
                MMM: m[d.getUTCMonth()],
                DD: d.getUTCDate(),
                hh: d.getUTCHours(),
                mm: d.getUTCMinutes(),
                ss: d.getUTCSeconds(),
                h2: d.getUTCHours() % 12,
                ap: d.getUTCHours() < 12 ? "AM" : "PM",
            };
            return o.replace(/(YY(YY)?|MMM?|DD|hh|mm|ss|h2|ap)/g, (n) =>
                ("0" + v[n]).substr(-n.length)
            );
        },

        language: {
            en: {
                download: "Download",
                download_all: "Download all", collecting: "Collecting", no_media: "No media found",
                download_all_confirm: "Found {count} media files. Start downloading?",
                download_all_done: "Finished processing {count} media files.", rate_limited: "Rate limited, waiting",
                download_all_failed: "Batch download failed: {error}",
                completed: "Download Completed",
                settings: "Settings",
                dialog: {
                    title: "Download Settings",
                    save: "Save",
                    save_history: "Remember download history",
                    clear_history: "(Clear)",
                    clear_confirm: "Clear download history?",
                    show_sensitive: "Always show sensitive content",
                    pattern: "File Name Pattern",
                },
            },
            ja: {
                download: "ダウンロード",
                download_all: "すべて保存", collecting: "収集中", no_media: "メディアが見つかりません",
                download_all_confirm: "{count} 件のメディアをダウンロードしますか？",
                download_all_done: "{count} 件の処理が完了しました。", rate_limited: "制限中、待機しています",
                download_all_failed: "一括ダウンロードに失敗しました: {error}",
                completed: "ダウンロード完了",
                settings: "設定",
                dialog: {
                    title: "ダウンロード設定",
                    save: "保存",
                    save_history: "ダウンロード履歴を保存する",
                    clear_history: "(クリア)",
                    clear_confirm: "ダウンロード履歴を削除する？",
                    show_sensitive: "センシティブな内容を常に表示する",
                    pattern: "ファイル名パターン",
                },
            },
            zh: {
                download: "下载",
                download_all: "下载全部", collecting: "正在收集", no_media: "未找到媒体",
                download_all_confirm: "共找到 {count} 个媒体文件，是否开始下载？",
                download_all_done: "已完成 {count} 个媒体文件的处理。", rate_limited: "遇到速率限制，正在等待",
                download_all_failed: "批量下载失败：{error}",
                completed: "下载完成",
                settings: "设置",
                dialog: {
                    title: "下载设置",
                    save: "保存",
                    save_history: "保存下载记录",
                    clear_history: "(清除)",
                    clear_confirm: "确认要清除下载记录？",
                    show_sensitive: "自动显示敏感的内容",
                    pattern: "文件名格式",
                },
            },
            "zh-Hant": {
                download: "下載",
                download_all: "下載全部", collecting: "正在收集", no_media: "未找到媒體",
                download_all_confirm: "共找到 {count} 個媒體檔案，是否開始下載？",
                download_all_done: "已完成 {count} 個媒體檔案的處理。", rate_limited: "遇到速率限制，正在等待",
                download_all_failed: "批量下載失敗：{error}",
                completed: "下載完成",
                settings: "設置",
                dialog: {
                    title: "下載設置",
                    save: "保存",
                    save_history: "保存下載記錄",
                    clear_history: "(清除)",
                    clear_confirm: "確認要清除下載記錄？",
                    show_sensitive: "自動顯示敏感的内容",
                    pattern: "文件名規則",
                },
            },
        },
        css: `
/* 信息流页面按钮 - 默认深浅色，hover 时蓝色 */
.tmd-down {margin-left: 12px; order: 99;}

/* 默认状态 - 深色文字 */
.tmd-down svg {color: rgb(83, 100, 113);}

/* Hover 状态 - Twitter 蓝色 #1D9BF0 */
.tmd-down:hover > div > div > div > div {color: rgb(29, 155, 240);}
.tmd-down:hover > div > div > div > div > div {
  background-color: rgba(29, 155, 240, 0.1);
}
.tmd-down:active > div > div > div > div > div {
  background-color: rgba(29, 155, 240, 0.2);
}
.tmd-down:hover svg {color: rgb(29, 155, 240);}
.tmd-down:hover div:first-child:not(:last-child) {
  background-color: rgba(29, 155, 240, 0.1);
}
.tmd-down:active div:first-child:not(:last-child) {
  background-color: rgba(29, 155, 240, 0.2);
}

/* 深色模式 - 默认浅色，hover 时蓝色 */
@media (prefers-color-scheme: dark) {
  .tmd-down svg {color: rgb(113, 118, 123);}
  .tmd-down:hover > div > div > div > div {color: rgb(29, 155, 240);}
  .tmd-down:hover > div > div > div > div > div {
    background-color: rgba(29, 155, 240, 0.1);
  }
  .tmd-down:active > div > div > div > div > div {
    background-color: rgba(29, 155, 240, 0.2);
  }
  .tmd-down:hover svg {color: rgb(29, 155, 240);}
  .tmd-down:hover div:first-child:not(:last-child) {
    background-color: rgba(29, 155, 240, 0.1);
  }
  .tmd-down:active div:first-child:not(:last-child) {
    background-color: rgba(29, 155, 240, 0.2);
  }
}

/* 媒体页按钮 - 与信息流一致的配色 + hover 时毛玻璃 */
.tmd-down.tmd-media {position: absolute; right: 0;}
.tmd-down.tmd-media > div {
  display: flex;
  border-radius: 99px;
  margin: 2px;
  transition: all 0.2s ease;
}
/* 默认状态 - 灰色图标（与信息流一致） */
.tmd-down.tmd-media > div > div {
  display: flex; 
  margin: 6px; 
  color: rgb(83, 100, 113);
}
/* Hover 状态 - Twitter 蓝色 + 毛玻璃背景 */
.tmd-down.tmd-media:hover > div {
  background-color: rgba(29, 155, 240, 0.85);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);
}
.tmd-down.tmd-media:hover > div > div {color: rgb(255, 255, 255);}

/* 深色模式 - 浅灰色图标（与信息流一致） */
@media (prefers-color-scheme: dark) {
  .tmd-down.tmd-media > div > div {color: rgb(113, 118, 123);}
  .tmd-down.tmd-media:hover > div {
    background-color: rgba(29, 155, 240, 0.85);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);
  }
  .tmd-down.tmd-media:hover > div > div {color: rgb(255, 255, 255);}
}

/* 图标状态 */
.tmd-down g {display: none;}
.tmd-down.download g.download, .tmd-down.completed g.completed, .tmd-down.loading g.loading, .tmd-down.failed g.failed {display: unset;}
.tmd-down.loading svg {animation: spin 1s linear infinite;}
@keyframes spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}

/* 设置面板按钮和标签 - 深浅色自适应 */
.tmd-btn {
  display: inline-block; 
  background-color: rgb(15, 20, 25); 
  color: rgb(255, 255, 255); 
  padding: 0 20px; 
  border-radius: 99px;
  font-weight: 600;
  transition: background-color 0.2s;
}
.tmd-btn:hover {background-color: rgba(15, 20, 25, 0.9);}

.tmd-tag {
  display: inline-block; 
  background-color: transparent; 
  color: rgb(15, 20, 25); 
  padding: 0 10px; 
  border-radius: 10px; 
  border: 1px solid rgb(207, 217, 222);
  font-weight: 600;
  margin: 5px;
  transition: background-color 0.2s;
  cursor: pointer;
}
.tmd-tag:hover {background-color: rgba(15, 20, 25, 0.08);}

@media (prefers-color-scheme: dark) {
  .tmd-btn {background-color: rgb(239, 243, 244); color: rgb(15, 20, 25);}
  .tmd-btn:hover {background-color: rgba(239, 243, 244, 0.9);}
  .tmd-tag {color: rgb(239, 243, 244); border-color: rgb(83, 100, 113);}
  .tmd-tag:hover {background-color: rgba(239, 243, 244, 0.08);}
}

/* 下载进度通知器 - 增大尺寸 + 毛玻璃效果 */
.tmd-notifier {
  display: none;
  position: fixed;
  left: 20px;
  bottom: 20px;
  color: rgb(15, 20, 25);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(207, 217, 222, 0.8);
  border-radius: 20px;
  padding: 12px 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s ease;
  z-index: 9999;
}

.tmd-notifier.running {
  display: flex;
  align-items: center;
  gap: 8px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tmd-notifier label {
  display: inline-flex;
  align-items: center;
  margin: 0 2px;
  padding: 6px 8px;
  border-radius: 10px;
  transition: background-color 0.2s;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
}

.tmd-notifier label:hover {
  background-color: rgba(15, 20, 25, 0.05);
}

.tmd-notifier label:before {
  content: " ";
  width: 24px;
  height: 24px;
  margin-right: 6px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 20px 20px;
  display: inline-block;
}

.tmd-notifier label:nth-child(1):before {
  background-image: url("data:image/svg+xml;charset=utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'><path d='M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l4,4 q1,1 2,0 l4,-4 M12,3 v11' fill='none' stroke='%23536471' stroke-width='2' stroke-linecap='round' /></svg>");
}

.tmd-notifier label:nth-child(2):before {
  background-image: url("data:image/svg+xml;charset=utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'><path d='M12,2 a1,1 0 0 1 0,20 a1,1 0 0 1 0,-20 M12,5 v7 h6' fill='none' stroke='%23536471' stroke-width='2' stroke-linejoin='round' stroke-linecap='round' /></svg>");
}

.tmd-notifier label:nth-child(3):before {
  background-image: url("data:image/svg+xml;charset=utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'><path d='M12,0 a2,2 0 0 0 0,24 a2,2 0 0 0 0,-24' fill='%231D9BF0' stroke='none' /><path d='M14.5,5 a1,1 0 0 0 -5,0 l0.5,9 a1,1 0 0 0 4,0 z M12,17 a2,2 0 0 0 0,5 a2,2 0 0 0 0,-5' fill='%23fff' stroke='none' /></svg>");
}

.tmd-notifier label:last-child {
  cursor: pointer;
  padding: 6px 10px;
  background-color: rgba(29, 155, 240, 0.1);
  color: rgb(29, 155, 240);
  border-radius: 10px;
  font-weight: 700;
}

.tmd-notifier label:last-child:hover {
  background-color: rgba(29, 155, 240, 0.15);
}

/* 深色模式下的通知器样式 */
@media (prefers-color-scheme: dark) {
  .tmd-notifier {
    color: rgb(231, 233, 234);
    background: rgba(32, 35, 39, 0.85);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    border-color: rgba(83, 100, 113, 0.4);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
  }
  
  .tmd-notifier label:hover {
    background-color: rgba(239, 243, 244, 0.08);
  }
  
  .tmd-notifier label:nth-child(1):before {
    background-image: url("data:image/svg+xml;charset=utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'><path d='M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l4,4 q1,1 2,0 l4,-4 M12,3 v11' fill='none' stroke='%23E7E9EA' stroke-width='2' stroke-linecap='round' /></svg>");
  }
  
  .tmd-notifier label:nth-child(2):before {
    background-image: url("data:image/svg+xml;charset=utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'><path d='M12,2 a1,1 0 0 1 0,20 a1,1 0 0 1 0,-20 M12,5 v7 h6' fill='none' stroke='%23E7E9EA' stroke-width='2' stroke-linejoin='round' stroke-linecap='round' /></svg>");
  }
  
  .tmd-notifier label:last-child {
    background-color: rgba(29, 155, 240, 0.15);
  }
  
  .tmd-notifier label:last-child:hover {
    background-color: rgba(29, 155, 240, 0.2);
  }
}

/* 图片按钮样式 */
.tmd-down.tmd-img {position: absolute; right: 0; bottom: 0; display: none !important;}
.tmd-down.tmd-img > div {
  display: flex;
  border-radius: 99px;
  margin: 2px;
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  transition: all 0.2s;
}
.tmd-down.tmd-img > div > div {display: flex; margin: 6px; color: rgb(15, 20, 25) !important;}
.tmd-down.tmd-img:not(:hover) > div > div {filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.5));}
.tmd-down.tmd-img:hover > div {background-color: rgba(255, 255, 255, 0.9);}
.tmd-down.tmd-img:hover > div > div {color: rgb(15, 20, 25) !important;}

@media (prefers-color-scheme: dark) {
  .tmd-down.tmd-img > div {background-color: rgba(0, 0, 0, 0.7);}
  .tmd-down.tmd-img > div > div {color: rgb(239, 243, 244) !important;}
  .tmd-down.tmd-img:not(:hover) > div > div {filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.5));}
  .tmd-down.tmd-img:hover > div {background-color: rgba(0, 0, 0, 0.9);}
  .tmd-down.tmd-img:hover > div > div {color: rgb(239, 243, 244) !important;}
}

:hover > .tmd-down.tmd-img, .tmd-img.loading, .tmd-img.completed, .tmd-img.failed {display: block !important;}
.tweet-detail-action-item {width: 20% !important;}
`,
        css_ss: `
/* show sensitive in media tab */
li[role="listitem"]>div>div>div>div:not(:last-child) {filter: none;}
li[role="listitem"]>div>div>div>div+div:last-child {display: none;}
`,
        svg: `
<g class="download"><path d="M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l4,4 q1,1 2,0 l4,-4 M12,3 v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></g>
<g class="completed"><path d="M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l3,4 q1,1 2,0 l8,-11" fill="none" stroke="#0F1419" stroke-width="2" stroke-linecap="round" /></g>
<g class="loading"><circle cx="12" cy="12" r="10" fill="none" stroke="#0F1419" stroke-width="4" opacity="0.4" /><path d="M12,2 a10,10 0 0 1 10,10" fill="none" stroke="#0F1419" stroke-width="4" stroke-linecap="round" /></g>
<g class="failed"><circle cx="12" cy="12" r="11" fill="#f33" stroke="currentColor" stroke-width="2" opacity="0.8" /><path d="M14,5 a1,1 0 0 0 -4,0 l0.5,9.5 a1.5,1.5 0 0 0 3,0 z M12,17 a2,2 0 0 0 0,4 a2,2 0 0 0 0,-4" fill="#fff" stroke="none" /></g>
`,
    };
})();

TMD.init();
