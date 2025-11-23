// ==UserScript==
// @name         Boss直聘助手
// @namespace    http://tampermonkey.net/
// @version      8.6.3
// @description  Boss直聘助手
// @author       jkl&ai
// @match        https://www.zhipin.com/*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';
    // -------------------- 全局常量定义 --------------------
    const SCRIPT_VERSION = '8.6.3'; // 更新版本号

    // -------------------- 配置 --------------------
    const DELAY_MIN = 1000;
    const DELAY_MAX = 3000;
    const SCROLL_DELAY = 1500;
    const SELECT_MAX = 1000;          // 选取的最大候选人数量

    // 新增：滚动配置 - 增强人工模拟
    const SCROLL_CONFIG = {
        SCROLL_BY_COUNT: 4,           // 每次滚动向下移动的候选人数
        PROCESS_BEFORE_SCROLL: 8,     // 修改：处理多少个候选人后触发滚动（从6改为8）
        SCROLL_TO_POSITION: 'start',  // 滚动位置: 'start'(顶部) 或 'center'(居中)
        SMOOTH_SCROLL_STEPS: 20,      // 平滑滚动步数
        SMOOTH_SCROLL_DELAY: 15,      // 平滑滚动每步延时(ms)
        SCROLL_CHECK_DELAY: 800,      // 滚动后检查候选人位置延时
        REPOSITION_DELAY: 300,        // 重新定位候选人时的额外延时
        MAX_SCROLL_DISTANCE: 1000,    // 新增：最大滚动距离限制（像素）
        // 新增人工模拟参数
        SCROLL_VARIANCE: 0.3,         // 滚动距离变化率 (±30%)
        OCCASIONAL_UP_SCROLL: 0.15,   // 15%概率向上轻微滚动
        RANDOM_PAUSE_CHANCE: 0.25,     // 25%概率在滚动中随机暂停
        PAUSE_MIN_DURATION: 300,      // 暂停最短时间(ms)
        PAUSE_MAX_DURATION: 800,      // 暂停最长时间(ms)
        SCROLL_SPEED_VARIANCE: 0.4,    // 滚动速度变化率 (±40%)
        OCCASIONAL_WOBBLE: 0.2,        // 20%概率添加轻微抖动
        WOBBLE_AMPLITUDE: 15,          // 抖动幅度(像素)
        WOBBLE_FREQUENCY: 3           // 抖动频率(每滚动步数)
    };

    // 新增：拟人化聊天记录读取配置
    const CHAT_READING_CONFIG = {
        // 阅读模式
        MODES: {
            LINEAR: 'linear',           // 线性阅读：从最新到最旧顺序阅读
            RANDOM_JUMP: 'random_jump', // 随机跳跃式阅读：随机跳跃位置阅读
            RECENT: 'recent',           // 浏览最近消息：只阅读最近的消息
            DEEP_SCAN: 'deep_scan'      // 深度扫描：仔细阅读每条消息
        },
        // 默认模式
        DEFAULT_MODE: 'linear',
        // 阅读速度配置（毫秒）
        READING_SPEED: {
            MIN: 100,                 // 最快阅读速度（ms/条消息）
            MAX: 800,                 // 最慢阅读速度（ms/条消息）
            VARIANCE: 0.4,            // 阅读速度变化率 (±40%)
        },
        // 暂停配置
        PAUSE_CONFIG: {
            CHANCE: 0.15,              // 暂停概率 (15%)
            MIN_DURATION: 500,         // 最短暂停时间 (ms)
            MAX_DURATION: 2000,        // 最长暂停时间 (ms)
        },
        // 鼠标移动配置
        MOUSE_MOVEMENT: {
            ENABLED: true,             // 是否启用鼠标移动模拟
            CHANCE: 0.7,               // 鼠标移动概率 (70%)
            MIN_DISTANCE: 20,          // 最小移动距离 (像素)
            MAX_DISTANCE: 150,         // 最大移动距离 (像素)
        },
        // 回滚阅读配置
        SCROLL_BACK_CONFIG: {
            CHANCE: 0.25,              // 回滚阅读概率 (25%)
            MIN_LINES: 3,              // 最少回滚行数
            MAX_LINES: 10,             // 最多回滚行数
        },
        // 关注点配置
        FOCUS_CONFIG: {
            LONG_MESSAGE_THRESHOLD: 50,  // 长消息阈值（字符数）
            LONG_MESSAGE_SLOWDOWN: 2.5, // 长消息阅读减速系数
            RESUME_SLOWDOWN: 3.0,       // 简历消息阅读减速系数
            WECHAT_SLOWDOWN: 2.0,       // 微信消息阅读减速系数
        },
        // 特定模式配置
        MODE_CONFIGS: {
            linear: {
                name: '线性阅读',
                description: '从最新到最旧顺序阅读所有消息',
                readAll: true,
                skipEmpty: true
            },
            random_jump: {
                name: '随机跳跃式阅读',
                description: '随机跳跃到不同位置阅读',
                readAll: false,
                jumpProbability: 0.3,   // 每3条消息后有30%概率跳跃
                jumpRange: 5            // 跳跃范围（上下5条消息）
            },
            recent: {
                name: '浏览最近消息',
                description: '只阅读最近的消息',
                readAll: false,
                maxMessages: 15,        // 最多阅读15条最近消息
                prioritizeCandidate: true // 优先阅读候选人消息
            },
            deep_scan: {
                name: '深度扫描',
                description: '仔细阅读每条消息，重点关注简历和联系方式',
                readAll: true,
                slowSpeed: true,        // 使用较慢阅读速度
                doubleReadKeywords: true // 对包含关键词的消息重读
            }
        }
    };

    const STREAM_CONFIG = {
        BATCH_SIZE: 40,              // 每批导出数量
        AUTO_FLUSH_INTERVAL: 180000, // 自动导出当前批次间隔（毫秒）
        CHUNK_SIZE: 1024 * 1024 * 2  // 单文件最大约2MB（粗略判断）
    };

    // 连续过滤跳过阈值 (仅针对 startDate)
    const MAX_CONSECUTIVE_FILTERED_OUT_START_DATE = 2;

    // 基础处理延时
    const DELAYS = {
        MAIN_PROCESS: 500,           // 主要处理循环延时
        DETAIL_LOAD: 700,            // 详情面板加载延时
        NAVIGATION: 800,             // 导航等待延时
        TRANSITION: 300,             // 页面切换延时
        SCROLL_WAIT: 500,            // 统一用于各种滚动等待
        LISTENER_SETUP: 700,         // 监听器设置延时
        MAX_WAIT: 3000,              // 最大等待超时时间
        KEYBOARD_DELAY: 300,         // 键盘事件间延时
        CLICK_DELAY: 200,            // 模拟点击事件延时
        OBSERVER_TRIGGER: 800,       // MutationObserver触发后等待
        // 新增参数（用于替换硬编码延时）
        FIRST_CANDIDATE_SETUP: 500,  // 第一个候选人初始设置延时
        FIRST_CANDIDATE_CLICK: 1000, // 第一个候选人点击后详情加载等待
        FIRST_CANDIDATE_RETRY: 800,  // 第一个候选人重试点击后的检查延时
        HOME_KEY_DELAY: 600,         // Home键导航延时
        BACK_BUTTON_DELAY: 800,      // 返回按钮延时
        RANDOM_EXTRA: 1000,          // 随机额外延时基数（原 Math.random() * 1000）
        UI_UPDATE_INTERVAL: 1000,    // UI更新间隔（setInterval）
        TIME_UPDATE_INTERVAL: 1000,  // 时间更新间隔（setInterval）
        // 新增滚动相关延时
        MOUSE_SCROLL_DELAY: 800,     // 鼠标滚动延时
        SCROLL_WAIT_TIME: 1000       // 滚动后等待时间
    };

    // 更新候选人选择器，适配新的页面结构
    const SELECTORS = {
        // 更新候选人的选择器，基于提供的外部HTML
        listItem: '.geek-item-wrap .geek-item, .geek-item',  // 候选人项
        candidatesContainer: '.user-list, .geek-list',      // 候选人列表容器
        idAttr: ['data-id', 'id', 'data-geek-id', 'id'],    // ID属性
        name: '.geek-name, .name-container .name-box, .base-name .name-box, [class*="name"]',  // 姓名
        positionList: '.source-job, .geek-title, .position-name, [class*="position"], [class*="job"]', // 职位列表
        lastTime: '.time, .time-shadow, [class*="time"]',   // 最后沟通时间
        lastMessage: '.push-text, .last-message, .last-msg, [class*="push"], [class*="text"]', // 最后消息

        // 详情面板选择器保持不变
        detailRoot: '.conversation-main, .base-info-single-main, .base-info-content, .chat-detail, .right-panel, [class*="detail"], [class*="conversation"]',

        baseInfoElementsContainer: '.base-info-single-detial, .base-info-single-top-detail, .base-info-single-top',
        baseInfoItems: 'div > span:not([class]), div > i, span.tag, [class*="base-info"] span, [class*="base-info"] div, .tag, [class*="highlight"], [style*="background-color: red"], [style*="border-color: red"]',

        activeStatus: '.active-time, .high-light-orange, [class*="active"]',
        tags: '.high-light-boss, [class*="tag"], [class*="label"]',

        communicationPosition: '.position-name, .value .position-name, [class*="position-name"]',
        expectArea: '.position-item.expect .value.job, .expect .value.job, .value.job, [class*="expect"]',
        salaryInExpect: '.position-item.expect .value.job i, .value.job i, i.high-light-orange',

        timeNodes: 'ul.time-content li .time, .time-content li span.time',
        detailNodes: 'ul.work-content li .value, .detail-list ul.work-content li .value, .work-content li .value',
        educationKeywords: /大学|学院|学校|本科|硕士|博士|大专|学位|专业|工程/i,

        convoRoot: '.conversation-message, .chat-message-list, .chat-message-list.is-to-top',
        messageItems: '.chat-message-list .message-item, .message-item',
        messageTime: '.message-time .time, .message-time span.time, .time',
        messageCard: '.message-card-top-title, .message-card-top-text, .message-card-top-title h3',
        messageText: '.item-friend .text span, .item-myself .text span, .text span, .text',
        senderRecruiter: '.item-myself, .item-system',

        lastMessageContent: '.push-text span, .push-text, .last-msg span',

        // 添加发送者类型选择器
        senderCandidate: '.item-friend',      // 候选人消息
        senderMyself: '.item-myself',         // 招聘者消息
        senderSystem: '.item-system',         // 系统消息
        senderUnknown: '.text',               // 其他未知类型
    };

    // 修复后的正则表达式（避免语法错误，确保浏览器兼容）
    const PATTERNS = {
        age: /(\d{1,2})\s*岁/,
        experience: /(\d{1,2}年\s*应届生|\d{1,2}年(?:\s*以上)?|(?:\d{2}年)?\s*应届生|多年(?:\s*经验)?|10年以上|\d{1,2}年(?:\s*实习(?:经验)?)?|\d{1,2}年(?:\s*工作经验)?)/i,
        education: /(博士|硕士|本科|学士|专科|大专|高中|中专|初中)/,
        salary: /([0-9]+[-~‑–]?[0-9]*K|\d+K|面议)/i,
        // 修复 cleanMessagePrefix：去掉 /s 标记，使用 . 匹配换行（浏览器兼容性更好）
        cleanMessagePrefix: /^(?:[\d:]{3,5}\s+[\u4e00-\u9fa5]{2,4}\s+[\u4e00-\u9fa5]{2,6}\s+[\w\u4e00-\u9fa5]*\s*)?(.*)$/,
        // lastMessage 清理正则
        lastMessageClean: /\[[\w\u4e00-\u9fa5]+?\]?\s*/g,
        // WeChat 正则
        weChatId: /(?:微信号|微信)：\s*([a-zA-Z0-9_\-]+)/,
        // Resume 正则 (已修正)
        resumeFileName: /([^\s,，;；]{0,120}?简历[^\s,，;；]*?\.(?:pdf|docx|doc|rtf|txt|odt|wps))/i
    };

    // 日期配置 - 默认开始日期为当日，结束日期为当日
    const DATE_CONFIG = {
        format: 'YYYY-MM-DD',
        getToday() {
            return new Date().toISOString().split('T')[0]; // 返回 YYYY-MM-DD 格式的当日
        }
    };

    const PERFORMANCE_MODE = {
        SPEED: '速度优先',     // 速度优先
        BALANCED: '平衡模式',  // 平衡模式
        STABLE: '稳定优先'     // 稳定性优先
    };

    var CURRENT_MODE = PERFORMANCE_MODE.BALANCED;

    const getDelay = (baseDelay) => {
        switch (CURRENT_MODE) {
            case PERFORMANCE_MODE.SPEED:
                return Math.floor(baseDelay * 0.7);
            case PERFORMANCE_MODE.STABLE:
                return Math.floor(baseDelay * 1.5);
            case PERFORMANCE_MODE.BALANCED:
            default:
                return baseDelay;
        }
    };

    // -------------------- 日志管理系统 --------------------
    class LogManager {
        constructor() {
            this.operationLog = [];
            this.successLog = [];
            this.errorLog = [];
            this.maxOperationLogs = 100;
        }

        addOperationLog(message, type = 'info') {
            const timestamp = new Date().toISOString();
            this.operationLog.push({
                timestamp,
                type,
                message
            });

            // 限制日志数量
            if (this.operationLog.length > this.maxOperationLogs) {
                this.operationLog.shift();
            }

            // 显示在UI上
            addLog(message, type);
        }

        addSuccessLog(candidateData) {
            const timestamp = new Date().toISOString();
            this.successLog.push({
                timestamp,
                candidateData: {
                    id: candidateData.id,
                    name: candidateData.name,
                    position: candidateData.position,
                    lastDate: candidateData.lastDate,
                    experience: candidateData.experience,
                    from: candidateData.from,
                    resume: candidateData.resume,
                    weChat: candidateData.weChat,
                    toolName: candidateData.toolName,
                    toolReason: candidateData.toolReason
                }
            });
        }

        addErrorLog(candidateName, error) {
            const timestamp = new Date().toISOString();
            this.errorLog.push({
                timestamp,
                candidateName,
                error: error.message || error.toString()
            });
        }

        exportOperationLog() {
            const exportLog = {
                metadata: {
                    recruiterName,
                    exportType: "操作日志",
                    exportTime: new Date().toISOString(),
                    version: SCRIPT_VERSION,
                    totalRecords: this.operationLog.length,
                    generator: "Boss直聘助手"
                },
                data: this.operationLog
            };
            this.downloadLog(exportLog, `operation_log_${this.getDateString()}_v${SCRIPT_VERSION}.json`);
        }

        exportSuccessLog() {
            const exportLog = {
                metadata: {
                    recruiterName,
                    exportType: "候选人成功导出日志",
                    exportTime: new Date().toISOString(),
                    version: SCRIPT_VERSION,
                    totalRecords: this.successLog.length,
                    generator: "Boss直聘助手"
                },
                data: this.successLog
            };
            this.downloadLog(exportLog, `candidates_success_log_${this.getDateString()}_v${SCRIPT_VERSION}.json`);
        }

        exportErrorLog() {
            const exportLog = {
                metadata: {
                    recruiterName,
                    exportType: "候选人抓取错误日志",
                    exportTime: new Date().toISOString(),
                    version: SCRIPT_VERSION,
                    totalRecords: this.errorLog.length,
                    generator: "Boss直聘助手"
                },
                data: this.errorLog
            };
            this.downloadLog(exportLog, `candidates_error_log_${this.getDateString()}_v${SCRIPT_VERSION}.json`);
        }

        exportAllLogs() {
            const exportLog = {
                metadata: {
                    recruiterName,
                    exportType: "全部日志",
                    exportTime: new Date().toISOString(),
                    version: SCRIPT_VERSION,
                    totalOperationRecords: this.operationLog.length,
                    totalSuccessRecords: this.successLog.length,
                    totalErrorRecords: this.errorLog.length,
                    generator: "Boss直聘助手"
                },
                operationLog: this.operationLog,
                successLog: this.successLog,
                errorLog: this.errorLog
            };
            this.downloadLog(exportLog, `${recruiterName}_all_logs_${this.getDateString()}_v${SCRIPT_VERSION}.json`);
        }

        downloadLog(logData, filename) {
            try {
                const dataStr = JSON.stringify(logData, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.addOperationLog(`成功导出日志文件: ${filename}`, 'success');
            } catch (err) {
                this.addOperationLog(`日志导出失败: ${err.message}`, 'error');
                console.error('Export log error:', err);
            }
        }

        getDateString() {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        clearLogs() {
            this.operationLog = [];
            this.successLog = [];
            this.errorLog = [];
            const logContent = document.getElementById('grab-log');
            if (logContent) {
                // 安全地清空内容，使用DOM方法而不是innerHTML
                while (logContent.firstChild) {
                    logContent.removeChild(logContent.firstChild);
                }
            }
            this.addOperationLog('所有日志已清空', 'info');
        }
    }

    // -------------------- 流式数据管理（含日期过滤） --------------------
    class StreamDataManager {
        constructor(logManager) {
            this.currentBatch = [];
            this.fileCounter = 1;
            this.startTime = new Date();
            this.logManager = logManager;
            this.dateRange = {
                startDate: DATE_CONFIG.getToday(), // 默认开始日期为当日
                endDate: DATE_CONFIG.getToday()    // 默认结束日期为当日
            };
            this.batchStats = {
                totalBatches: 0,
                currentBatchSize: 0,
                maxBatchSize: STREAM_CONFIG.BATCH_SIZE,
                filteredCount: 0,
                totalCount: 0
            };
            this.autoFlushTimer = null;
        }

        // 设置日期范围
        setDateRange(startDate, endDate) {
            this.dateRange.startDate = startDate;
            this.dateRange.endDate = endDate;
            this.logManager.addOperationLog(`日期过滤已设置: 开始沟通日期 ${startDate}，结束沟通日期 ${endDate}`, 'info');
            this.updateDateRangeDisplay();
        }

        // 检查日期是否在范围内 (startDate <= lastDate <= endDate)
        isDateInRange(dateStr) {
            const targetDate = new Date(dateStr + 'T00:00:00');
            const startDate = new Date(this.dateRange.startDate + 'T00:00:00');
            const endDate = new Date(this.dateRange.endDate + 'T00:00:00');
            return targetDate >= startDate && targetDate <= endDate;
        }

        addData(candidateData) {
            this.batchStats.totalCount++;
            // 日期过滤
            if (!this.isDateInRange(candidateData.lastDate)) {
                // 判断是否是早于 startDate 导致的过滤
                const targetDate = new Date(candidateData.lastDate + 'T00:00:00');
                const startDate = new Date(this.dateRange.startDate + 'T00:00:00');

                if (targetDate < startDate) {
                    this.logManager.addOperationLog(`跳过 ${candidateData.name} (日期: ${candidateData.lastDate} 早于设置的开始日期 ${this.dateRange.startDate})`, 'warning');
                    // 增加连续过滤计数，仅针对早于 startDate 的情况
                    grabStats.consecutiveFilteredOutStartDate++;
                } else {
                    this.logManager.addOperationLog(`跳过 ${candidateData.name} (日期: ${candidateData.lastDate} 晚于设置的结束日期 ${this.dateRange.endDate})`, 'warning');
                    // 如果是因为晚于 endDate 过滤，则重置连续过滤计数
                    grabStats.consecutiveFilteredOutStartDate = 0;
                }
                return; // 不在日期范围内，跳过
            }

            // 如果未被过滤，则重置连续过滤计数
            grabStats.consecutiveFilteredOutStartDate = 0;

            this.currentBatch.push(candidateData);
            this.batchStats.currentBatchSize = this.currentBatch.length;
            this.batchStats.filteredCount++;

            // 添加到成功日志
            this.logManager.addSuccessLog(candidateData);

            if (this.currentBatch.length >= STREAM_CONFIG.BATCH_SIZE) {
                this.flushCurrentBatch();
            }

            if (!this.autoFlushTimer) {
                this.autoFlushTimer = setInterval(() => {
                    if (this.currentBatch.length > 0) this.flushCurrentBatch();
                }, STREAM_CONFIG.AUTO_FLUSH_INTERVAL);
            }

            this.updateStreamStats();
        }

        async flushCurrentBatch() {
            if (this.currentBatch.length === 0) return;

            const batchData = {
                metadata: {
                    recruiterName: recruiterName,
                    batchNumber: this.fileCounter,
                    batchSize: this.currentBatch.length,
                    startTime: this.startTime.toISOString(),
                    endTime: new Date().toISOString(),
                    version: SCRIPT_VERSION,
                    generator: 'Boss直聘助手',
                    totalProcessed: grabStats.processed,
                    dateFilter: {
                        startDate: this.dateRange.startDate,
                        endDate: this.dateRange.endDate,
                        filteredCount: this.batchStats.filteredCount,
                        totalCount: this.batchStats.totalCount
                    }
                },
                data: [...this.currentBatch]
            };

            try {
                await this.exportBatch(batchData);
                this.fileCounter++;
                this.batchStats.totalBatches++;
                this.currentBatch = [];
                this.batchStats.currentBatchSize = 0;
                this.logManager.addOperationLog(`批次 ${batchData.metadata.batchNumber} 导出完成 (${batchData.data.length} 条记录，日期过滤后: ${this.batchStats.filteredCount}/${this.batchStats.totalCount})`, 'success');
            } catch (err) {
                this.logManager.addOperationLog(`批次导出失败: ${err.message}`, 'error');
                console.error('Batch export error:', err);
            }

            this.updateStreamStats();
        }

        exportBatch(batchData) {
            return new Promise((resolve, reject) => {
                try {
                    const dataStr = JSON.stringify(batchData, null, 2);
                    if (dataStr.length * 2 > STREAM_CONFIG.CHUNK_SIZE) {
                        reject(new Error('批次数据过大，超过文件大小限制'));
                        return;
                    }
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${recruiterName}_candidates_from_${this.dateRange.startDate}_to_${this.dateRange.endDate}_batch_${batchData.metadata.batchNumber}_v${SCRIPT_VERSION}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    setTimeout(resolve, getDelay(DELAYS.CLICK_DELAY));
                } catch (err) {
                    reject(err);
                }
            });
        }

        async exportRemaining() {
            if (this.currentBatch.length === 0) {
                this.logManager.addOperationLog('无剩余数据可导出', 'info');
                return;
            }
            await this.flushCurrentBatch();
        }

        getBatchStats() {
            return { ...this.batchStats };
        }

        getDateRange() {
            return { ...this.dateRange };
        }

        updateDateRangeDisplay() {
            const startDateEl = document.getElementById('start-date');
            const endDateEl = document.getElementById('end-date');
            if (startDateEl) startDateEl.value = this.dateRange.startDate;
            if (endDateEl) endDateEl.value = this.dateRange.endDate;
        }

        updateStreamStats() {
            const elCurrent = document.getElementById('current-batch');
            const elExported = document.getElementById('exported-batches');
            const elBatchSize = document.getElementById('batch-size');
            const elFiltered = document.getElementById('filtered-count');
            if (elCurrent) elCurrent.textContent = this.batchStats.currentBatchSize;
            if (elExported) elExported.textContent = this.batchStats.totalBatches;
            if (elBatchSize) elBatchSize.textContent = String(this.batchStats.maxBatchSize);
            if (elFiltered) elFiltered.textContent = `${this.batchStats.filteredCount}/${this.batchStats.totalCount}`;
        }

        cleanup() {
            if (this.autoFlushTimer) {
                clearInterval(this.autoFlushTimer);
                this.autoFlushTimer = null;
            }
            this.currentBatch = [];
            this.batchStats.currentBatchSize = 0;
            this.batchStats.filteredCount = 0;
            this.batchStats.totalCount = 0;
            this.fileCounter = 1;
            this.batchStats.totalBatches = 0;
            this.updateStreamStats();
            this.logManager.addOperationLog('流式数据管理器已重置', 'info');
        }
    }

    let isRunning = false;

    // 初始化日志管理器
    const logManager = new LogManager();
    const streamManager = new StreamDataManager(logManager);

    let grabStats = {
        total: 0,        // 总数改为0，不再显示实际总数
        processed: 0,
        success: 0,
        failed: 0,
        startTime: null,
        consecutiveFilteredOutStartDate: 0 // 新增：连续因 lastDate < startDate 而跳过的计数
    };

    let recruiterName = '';  // 全局招聘人员名字符串变量
    let timerInterval = null;
    let processedCount = 0;  // 新增：实际处理的候选人数

    // -------------------- 拟人化聊天记录读取功能 --------------------
    // 新增：拟人化聊天记录读取函数
    async function simulateHumanReading(convoRoot, mode = CHAT_READING_CONFIG.DEFAULT_MODE) {
        try {
            if (!convoRoot) {
                logManager.addOperationLog('未找到聊天记录容器，跳过拟人化阅读', 'warning');
                return;
            }

            // 获取当前模式配置
            const modeConfig = CHAT_READING_CONFIG.MODE_CONFIGS[mode] ||
                               CHAT_READING_CONFIG.MODE_CONFIGS[CHAT_READING_CONFIG.DEFAULT_MODE];

            logManager.addOperationLog(`开始拟人化聊天记录读取，使用模式: ${modeConfig.name}`, 'info');

            // 获取所有消息项
            const messageItems = Array.from(convoRoot.querySelectorAll(SELECTORS.messageItems));
            if (messageItems.length === 0) {
                logManager.addOperationLog('未找到聊天消息，跳过拟人化阅读', 'warning');
                return;
            }

            // 根据模式处理消息
            let messagesToRead = [];

            switch (mode) {
                case CHAT_READING_CONFIG.MODES.LINEAR:
                    messagesToRead = [...messageItems];
                    break;

                case CHAT_READING_CONFIG.MODES.RANDOM_JUMP:
                    // 随机选择一些消息，但确保涵盖整个范围
                    const step = Math.max(1, Math.floor(messageItems.length / 10));
                    messagesToRead = [];
                    let currentIndex = 0;

                    while (currentIndex < messageItems.length) {
                        messagesToRead.push(messageItems[currentIndex]);

                        // 根据配置的概率决定是否跳跃
                        if (Math.random() < modeConfig.jumpProbability) {
                            const jumpRange = modeConfig.jumpRange;
                            const jumpDirection = Math.random() < 0.5 ? -1 : 1;
                            const jumpDistance = Math.floor(Math.random() * jumpRange) + 1;
                            currentIndex = Math.max(0, Math.min(messageItems.length - 1,
                              currentIndex + jumpDirection * jumpDistance));
                        } else {
                            currentIndex++;
                        }
                    }
                    break;

                case CHAT_READING_CONFIG.MODES.RECENT:
                    // 获取最近的消息
                    const startIndex = Math.max(0, messageItems.length - modeConfig.maxMessages);
                    messagesToRead = messageItems.slice(startIndex);

                    // 如果配置为优先阅读候选人消息，则调整顺序
                    if (modeConfig.prioritizeCandidate) {
                        messagesToRead.sort((a, b) => {
                            const aIsCandidate = a.querySelector(SELECTORS.senderCandidate);
                            const bIsCandidate = b.querySelector(SELECTORS.senderCandidate);

                            // 候选人消息优先
                            if (aIsCandidate && !bIsCandidate) return -1;
                            if (!aIsCandidate && bIsCandidate) return 1;
                            return 0;
                        });
                    }
                    break;

                case CHAT_READING_CONFIG.MODES.DEEP_SCAN:
                    messagesToRead = [...messageItems];
                    break;

                default:
                    messagesToRead = [...messageItems];
            }

            // 读取每条消息
            for (let i = 0; i < messagesToRead.length; i++) {
                const message = messagesToRead[i];
                const messageText = message.querySelector('.text') ||
                                    message.querySelector(SELECTORS.messageText);
                const content = messageText ? (messageText.innerText || messageText.textContent || '').trim() : '';

                // 跳过空消息
                if (!content || (modeConfig.skipEmpty && content.length < 3)) {
                    continue;
                }

                // 确定消息发送者类型
                let senderType = 'unknown';
                if (message.querySelector(SELECTORS.senderCandidate)) {
                    senderType = 'candidate';
                } else if (message.querySelector(SELECTORS.senderMyself)) {
                    senderType = 'recruiter';
                } else if (message.querySelector(SELECTORS.senderSystem)) {
                    senderType = 'system';
                }

                // 计算阅读延迟
                let readingDelay = calculateReadingDelay(content, senderType, mode);

                // 模拟鼠标移动
                if (CHAT_READING_CONFIG.MOUSE_MOVEMENT.ENABLED &&
                    Math.random() < CHAT_READING_CONFIG.MOUSE_MOVEMENT.CHANCE) {
                    simulateMouseMove(message);
                }

                // 滚动到消息位置
                await smoothScrollToMessage(message, convoRoot);

                // 模拟阅读时间
                await new Promise(resolve => setTimeout(resolve, readingDelay));

                // 随机暂停
                if (Math.random() < CHAT_READING_CONFIG.PAUSE_CONFIG.CHANCE) {
                    const pauseDuration = Math.random() *
                        (CHAT_READING_CONFIG.PAUSE_CONFIG.MAX_DURATION - CHAT_READING_CONFIG.PAUSE_CONFIG.MIN_DURATION) +
                        CHAT_READING_CONFIG.PAUSE_CONFIG.MIN_DURATION;

                    logManager.addOperationLog(`拟人化阅读中暂停 ${Math.round(pauseDuration)}ms`, 'info');
                    await new Promise(resolve => setTimeout(resolve, pauseDuration));
                }

                // 深度扫描模式下，对特定消息重读
                if (mode === CHAT_READING_CONFIG.MODES.DEEP_SCAN &&
                    modeConfig.doubleReadKeywords &&
                    hasKeywords(content)) {
                    logManager.addOperationLog(`深度扫描：重读关键词消息 "${content.substring(0, 20)}..."`, 'info');
                    await new Promise(resolve => setTimeout(resolve, readingDelay * 1.5));
                }

                // 随机回滚阅读
                if (Math.random() < CHAT_READING_CONFIG.SCROLL_BACK_CONFIG.CHANCE && i > 0) {
                    const backLines = Math.floor(Math.random() *
                        (CHAT_READING_CONFIG.SCROLL_BACK_CONFIG.MAX_LINES - CHAT_READING_CONFIG.SCROLL_BACK_CONFIG.MIN_LINES + 1)) +
                        CHAT_READING_CONFIG.SCROLL_BACK_CONFIG.MIN_LINES;

                    const backIndex = Math.max(0, i - backLines);
                    const backMessage = messagesToRead[backIndex];

                    logManager.addOperationLog(`拟人化阅读中回滚 ${backLines} 条消息`, 'info');
                    await smoothScrollToMessage(backMessage, convoRoot);
                    await new Promise(resolve => setTimeout(resolve, readingDelay * 0.5));

                    // 回滚后再次滚动到当前消息
                    await smoothScrollToMessage(message, convoRoot);
                }
            }

            logManager.addOperationLog(`拟人化聊天记录读取完成，共读取 ${messagesToRead.length} 条消息`, 'success');
        } catch (error) {
            console.error('拟人化聊天记录读取出错:', error);
            logManager.addOperationLog(`拟人化阅读出错: ${error.message}`, 'error');
        }
    }

    // 计算阅读延迟
    function calculateReadingDelay(content, senderType, mode) {
        const config = CHAT_READING_CONFIG.MODE_CONFIGS[mode] ||
                      CHAT_READING_CONFIG.MODE_CONFIGS[CHAT_READING_CONFIG.DEFAULT_MODE];

        // 基础延迟
        let baseDelay = (CHAT_READING_CONFIG.READING_SPEED.MIN + CHAT_READING_CONFIG.READING_SPEED.MAX) / 2;

        // 根据内容长度调整
        const contentLength = content.length;
        const lengthFactor = Math.min(contentLength / 50, 3); // 最多3倍延迟

        // 根据模式调整
        if (mode === CHAT_READING_CONFIG.MODES.DEEP_SCAN && config.slowSpeed) {
            baseDelay *= 1.5; // 深度扫描模式慢速阅读
        }

        // 根据发送者类型调整
        let senderFactor = 1.0;

        // 检查是否包含特殊内容
        const hasResume = PATTERNS.resumeFileName.test(content);
        const hasWeChat = PATTERNS.weChatId.test(content);
        const isLongMessage = contentLength > CHAT_READING_CONFIG.FOCUS_CONFIG.LONG_MESSAGE_THRESHOLD;

        if (hasResume) {
            senderFactor *= CHAT_READING_CONFIG.FOCUS_CONFIG.RESUME_SLOWDOWN;
        }

        if (hasWeChat) {
            senderFactor *= CHAT_READING_CONFIG.FOCUS_CONFIG.WECHAT_SLOWDOWN;
        }

        if (isLongMessage) {
            senderFactor *= CHAT_READING_CONFIG.FOCUS_CONFIG.LONG_MESSAGE_SLOWDOWN;
        }

        // 应用随机变化
        const variance = 1 + (Math.random() * 2 - 1) * CHAT_READING_CONFIG.READING_SPEED.VARIANCE;

        // 计算最终延迟
        const finalDelay = baseDelay * lengthFactor * senderFactor * variance;

        return Math.max(CHAT_READING_CONFIG.READING_SPEED.MIN,
                        Math.min(CHAT_READING_CONFIG.READING_SPEED.MAX * 3, finalDelay));
    }

    // 检查消息是否包含关键词
    function hasKeywords(content) {
        const keywords = [
            '简历', '微信', '电话', '邮箱', '经验', '项目', '技能',
            '期望', '薪资', '到岗', '面试', 'offer', '学历', '学校',
            '专业', '公司', '职位', '地址', '时间', '地点'
        ];

        return keywords.some(keyword => content.includes(keyword));
    }

    // 模拟鼠标移动
    function simulateMouseMove(element) {
        try {
            if (!element) return;

            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // 计算随机偏移
            const maxDistance = CHAT_READING_CONFIG.MOUSE_MOVEMENT.MAX_DISTANCE;
            const minDistance = CHAT_READING_CONFIG.MOUSE_MOVEMENT.MIN_DISTANCE;
            const distance = minDistance + Math.random() * (maxDistance - minDistance);
            const angle = Math.random() * 2 * Math.PI;

            const targetX = centerX + Math.cos(angle) * distance;
            const targetY = centerY + Math.sin(angle) * distance;

            // 创建鼠标移动事件
            const moveEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX: targetX,
                clientY: targetY
            });

            // 分发事件
            document.dispatchEvent(moveEvent);
        } catch (error) {
            console.error('模拟鼠标移动出错:', error);
        }
    }

    // 平滑滚动到消息
    async function smoothScrollToMessage(messageElement, container) {
        return new Promise((resolve) => {
            try {
                if (!messageElement || !container) {
                    resolve();
                    return;
                }

                const messageRect = messageElement.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                // 计算目标滚动位置，使消息位于容器中间
                const messageTopInContainer = messageRect.top - containerRect.top + container.scrollTop;
                const targetScrollTop = messageTopInContainer - (container.clientHeight / 2) + (messageRect.height / 2);

                // 限制在有效范围内
                const finalScrollTop = Math.max(0,
                    Math.min(targetScrollTop, container.scrollHeight - container.clientHeight));

                // 使用平滑滚动函数
                smoothScrollElement(container, 'down', Math.abs(finalScrollTop - container.scrollTop))
                    .then(() => {
                        // 短暂延迟后解决
                        setTimeout(resolve, 100);
                    });
            } catch (error) {
                console.error('平滑滚动到消息出错:', error);
                resolve();
            }
        });
    }

    // -------------------- DOM操作工具函数 --------------------
    // 安全DOM元素创建函数
    function safeCreateElement(tagName, attributes = {}, textContent = '') {
        try {
            const element = document.createElement(tagName);

            // 设置属性
            Object.keys(attributes).forEach(attr => {
                if (attr === 'style' && typeof attributes[attr] === 'object') {
                    Object.assign(element.style, attributes[attr]);
                } else if (attr.startsWith('on') && typeof attributes[attr] === 'function') {
                    element.addEventListener(attr.slice(2).toLowerCase(), attributes[attr]);
                } else {
                    element.setAttribute(attr, attributes[attr]);
                }
            });

            // 设置文本内容（而不是innerHTML）
            if (textContent !== undefined && textContent !== null) {
                element.appendChild(document.createTextNode(textContent));
            }

            return element;
        } catch (error) {
            console.error('创建元素时出错:', error);
            return document.createElement('div');
        }
    }

    // 安全设置元素内容
    function safeSetContent(element, content) {
        try {
            if (typeof content === 'string') {
                // 移除所有可能的HTML标签，只保留文本
                element.appendChild(document.createTextNode(content));
            } else if (content instanceof HTMLElement) {
                element.appendChild(content);
            }
        } catch (error) {
            console.error('安全设置内容时出错:', error);
            element.appendChild(document.createTextNode('内容设置出错'));
        }
    }

    // -------------------- UI 面板（使用安全DOM操作） --------------------
    function createFloatingPanel() {
        try {
            // 创建面板主容器
            const panel = safeCreateElement('div', {
                id: 'grab-candidates-panel'
            });

            // 创建标题栏
            const header = safeCreateElement('div', {
                class: 'panel-header'
            });

            const title = safeCreateElement('div', {
                class: 'panel-title'
            });
            title.appendChild(safeCreateElement('span', {
                class: 'icon'
            }, '🕷️'));
            title.appendChild(document.createTextNode('boss直聘助手（v' + SCRIPT_VERSION + ')'));

            const controls = safeCreateElement('div', {
                class: 'panel-controls'
            });

            const minimizeBtn = safeCreateElement('button', {
                class: 'minimize-btn',
                title: '最小化'
            }, '−');

            const closeBtn = safeCreateElement('button', {
                class: 'close-btn',
                title: '关闭'
            }, '×');

            controls.appendChild(minimizeBtn);
            controls.appendChild(closeBtn);
            header.appendChild(title);
            header.appendChild(controls);

            // 创建内容区域
            const content = safeCreateElement('div', {
                class: 'panel-content'
            });

            // 创建统计区域
            const statsSection = safeCreateElement('div', {
                class: 'stats-section'
            });

            // 总数量
            const statTotalItem = safeCreateElement('div', {
                class: 'stat-item'
            });
            const totalLabel = safeCreateElement('label', {}, '总数量:');
            const totalValue = safeCreateElement('span', {
                id: 'stat-total'
            }, '不限');
            statTotalItem.appendChild(totalLabel);
            statTotalItem.appendChild(totalValue);

            // 已处理
            const statProcessedItem = safeCreateElement('div', {
                class: 'stat-item'
            });
            const processedLabel = safeCreateElement('label', {}, '已处理:');
            const processedValue = safeCreateElement('span', {
                id: 'stat-processed'
            }, '0');
            statProcessedItem.appendChild(processedLabel);
            statProcessedItem.appendChild(processedValue);

            // 成功率
            const statSuccessItem = safeCreateElement('div', {
                class: 'stat-item'
            });
            const successLabel = safeCreateElement('label', {}, '成功率:');
            const successValue = safeCreateElement('span', {
                id: 'stat-success'
            }, '0%');
            statSuccessItem.appendChild(successLabel);
            statSuccessItem.appendChild(successValue);

            // 用时
            const statTimeItem = safeCreateElement('div', {
                class: 'stat-item'
            });
            const timeLabel = safeCreateElement('label', {}, '用时:');
            const timeValue = safeCreateElement('span', {
                id: 'stat-time'
            }, '0s');
            statTimeItem.appendChild(timeLabel);
            statTimeItem.appendChild(timeValue);

            statsSection.appendChild(statTotalItem);
            statsSection.appendChild(statProcessedItem);
            statsSection.appendChild(statSuccessItem);
            statsSection.appendChild(statTimeItem);

            // 创建日期过滤区域
            const dateFilterSection = safeCreateElement('div', {
                class: 'date-filter-section'
            });

            const dateInputs = safeCreateElement('div', {
                class: 'date-inputs'
            });

            // 开始日期
            const startGroup = safeCreateElement('div', {
                class: 'date-input-group'
            });
            const startLabel = safeCreateElement('label', {
                for: 'start-date'
            }, '开始日期:');
            const startDateInput = safeCreateElement('input', {
                type: 'date',
                id: 'start-date',
                class: 'date-input',
                value: streamManager.getDateRange().startDate
            });
            startGroup.appendChild(startLabel);
            startGroup.appendChild(startDateInput);

            // 结束日期
            const endGroup = safeCreateElement('div', {
                class: 'date-input-group'
            });
            const endLabel = safeCreateElement('label', {
                for: 'end-date'
            }, '结束日期:');
            const endDateInput = safeCreateElement('input', {
                type: 'date',
                id: 'end-date',
                class: 'date-input',
                value: streamManager.getDateRange().endDate
            });
            endGroup.appendChild(endLabel);
            endGroup.appendChild(endDateInput);

            dateInputs.appendChild(startGroup);
            dateInputs.appendChild(endGroup);
            dateFilterSection.appendChild(dateInputs);

            // 创建流统计区域
            const streamStats = safeCreateElement('div', {
                class: 'stream-stats'
            });

            // 创建四个统计项 - 使用函数简化创建过程
            const createStreamStatItem = (labelText, spanId, spanValue) => {
                const item = safeCreateElement('div', {
                    class: 'stream-item'
                });
                const label = safeCreateElement('label', {}, labelText);
                const value = safeCreateElement('span', {
                    id: spanId
                }, spanValue);
                item.appendChild(label);
                item.appendChild(value);
                return item;
            };

            streamStats.appendChild(createStreamStatItem('当前批次:', 'current-batch', '0'));
            streamStats.appendChild(createStreamStatItem('已导出批次:', 'exported-batches', '0'));
            streamStats.appendChild(createStreamStatItem('批次大小:', 'batch-size', STREAM_CONFIG.BATCH_SIZE.toString()));
            streamStats.appendChild(createStreamStatItem('过滤结果:', 'filtered-count', '0/0'));

            // 创建日志区域
            const logSection = safeCreateElement('div', {
                class: 'log-section'
            });

            const logHeader = safeCreateElement('div', {
                class: 'log-header'
            });
            logHeader.appendChild(document.createTextNode('操作日志'));

            const logActions = safeCreateElement('div', {
                class: 'log-actions'
            });

            const exportBtn = safeCreateElement('button', {
                id: 'log-export-btn',
                title: '导出日志'
            }, '📄');

            const clearBtn = safeCreateElement('button', {
                id: 'log-clear-btn',
                title: '清空日志'
            }, '🗑️');

            const dropdown = safeCreateElement('div', {
                id: 'log-export-dropdown',
                class: 'log-export-dropdown'
            });

            // 创建下拉选项
            const createDropdownOption = (type, text) => {
                const option = safeCreateElement('div', {
                    class: 'log-export-option',
                    'data-type': type
                }, text);
                return option;
            };

            dropdown.appendChild(createDropdownOption('operation', '导出操作日志'));
            dropdown.appendChild(createDropdownOption('success', '导出候选人日志'));
            dropdown.appendChild(createDropdownOption('error', '导出错误日志'));
            dropdown.appendChild(createDropdownOption('all', '导出全部日志'));

            logActions.appendChild(exportBtn);
            logActions.appendChild(clearBtn);
            logActions.appendChild(dropdown);

            logHeader.appendChild(logActions);

            const logContent = safeCreateElement('div', {
                id: 'grab-log',
                class: 'log-content'
            });

            logSection.appendChild(logHeader);
            logSection.appendChild(logContent);

            // 创建进度区域
            const progressSection = safeCreateElement('div', {
                class: 'progress-section'
            });

            const progressBar = safeCreateElement('div', {
                class: 'progress-bar'
            });

            const progressFill = safeCreateElement('div', {
                id: 'progress-fill',
                class: 'progress-fill'
            });

            const progressText = safeCreateElement('div', {
                id: 'progress-text',
                class: 'progress-text'
            }, '准备就绪');

            progressBar.appendChild(progressFill);
            progressSection.appendChild(progressBar);
            progressSection.appendChild(progressText);

            // 添加所有内容到content区域
            content.appendChild(statsSection);
            content.appendChild(dateFilterSection);
            content.appendChild(streamStats);
            content.appendChild(logSection);
            content.appendChild(progressSection);

            // 创建底部区域
            const footer = safeCreateElement('div', {
                class: 'panel-footer'
            });

            const startBtn = safeCreateElement('button', {
                id: 'start-btn',
                class: 'btn btn-start'
            }, '开始抓取');

            const stopBtn = safeCreateElement('button', {
                id: 'stop-btn',
                class: 'btn btn-stop',
                disabled: 'disabled'
            }, '停止');

            const exportRemainingBtn = safeCreateElement('button', {
                id: 'export-btn',
                class: 'btn btn-export',
                disabled: 'disabled'
            }, '导出剩余');

            const resetBtn = safeCreateElement('button', {
                id: 'reset-btn',
                class: 'btn btn-reset'
            }, '重置流程');

            footer.appendChild(startBtn);
            footer.appendChild(stopBtn);
            footer.appendChild(exportRemainingBtn);
            footer.appendChild(resetBtn);

            // 组装整个面板
            panel.appendChild(header);
            panel.appendChild(content);
            panel.appendChild(footer);

            // 创建样式
            createPanelStyles();

            // 将面板添加到页面
            document.body.appendChild(panel);

            // 添加交互性
            addPanelInteractivity(panel);
            addDateFilterEvents();
            addLogExportEvents();

            return panel;
        } catch (error) {
            console.error('创建面板时发生错误:', error);
            throw error;
        }
    }

    // 安全地创建面板样式
    function createPanelStyles() {
        const styleElement = safeCreateElement('style', {
            id: 'boss-assistant-styles'
        });

        // 使用安全的文本节点设置样式
        try {
            const styleRules = [
                "#grab-candidates-panel { position: fixed; top: 100px; right: 20px; width: 400px; background: #fff; border: 2px solid #4285f4; border-radius: 12px; box-shadow: 0 8px 32px rgba(66,133,244,0.3); z-index: 10000; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:13px; transition: all .3s; user-select:none; }",
                "#grab-candidates-panel.minimized { height: 50px; overflow: hidden; }",
                ".panel-header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background: linear-gradient(135deg,#4285f4 0%,#34a853 100%); color:#fff; border-radius:10px 10px 0 0; cursor:move; }",
                ".panel-title { display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; }",
                ".panel-controls { display:flex; gap:5px; }",
                ".panel-controls button { width:24px;height:24px;border:none;border-radius:50%;background:rgba(255,255,255,0.2);color:white;cursor:pointer;font-size:14px;font-weight:bold;display:flex;align-items:center;justify-content:center; }",
                ".panel-controls button:hover { background:rgba(255,255,255,0.3); transform:scale(1.1); }",
                ".panel-content { padding:16px; max-height:500px; overflow-y:auto; scrollbar-width: thin; scrollbar-color: #e0e0e0 transparent; }",
                ".panel-content::-webkit-scrollbar { width: 6px; }",
                ".panel-content::-webkit-scrollbar-track { background: transparent; border-radius: 3px; }",
                ".panel-content::-webkit-scrollbar-thumb { background-color: #e0e0e0; border-radius: 3px; border: none; }",
                ".panel-content::-webkit-scrollbar-thumb:hover { background-color: #bdbdbd; }",
                ".stats-section { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }",
                ".stat-item { display:flex; justify-content:space-between; padding:8px 12px; background:#f8f9fa; border-radius:6px; border-left:3px solid #4285f4; }",
                ".date-filter-section { margin-bottom:16px; padding:12px; background: linear-gradient(135deg, #fff3e0 0%, #f1f8e9 100%); border-radius:8px; border: 1px solid #ff9800; }",
                ".date-filter-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; }",
                ".date-filter-icon { font-size:16px; }",
                ".date-filter-title { font-weight:600; color:#e65100; font-size:12px; }",
                ".date-inputs { display:grid; grid-template-columns:1fr 1fr; gap:12px; }",
                ".date-input-group { display:flex; flex-direction:column; gap:4px; }",
                ".date-input-group label { font-size:11px; font-weight:600; color:#bf360c; }",
                ".date-input { padding:6px 8px; border:1px solid #ffb74d; border-radius:4px; font-size:12px; background:#fff; }",
                ".date-input:focus { border-color:#ff9800; outline:none; box-shadow:0 0 4px rgba(255,152,0,0.3); }",
                ".stream-stats { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; padding:12px; background: linear-gradient(135deg,#e8f5e8 0%,#f0f8ff 100%); border-radius:8px; border:1px solid #4caf50; }",
                ".stream-item { display:flex; justify-content:space-between; padding:4px 8px; background:rgba(255,255,255,0.7); border-radius:4px; font-size:11px; }",
                ".log-section { margin-bottom:16px; }",
                ".log-header { display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#5f6368; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #e8eaed; }",
                ".log-actions { display:flex; gap:8px; position:relative; }",
                ".log-actions button { background:transparent;border:none;font-size:16px;cursor:pointer;padding:2px 4px;border-radius:3px; }",
                ".log-actions button:hover { background:#e8eaed; }",
                ".log-content { height:120px; overflow-y:auto; background:#f8f9fa; border:1px solid #e8eaed; border-radius:6px; padding:8px; font-size:11px; line-height:1.4; scrollbar-width: thin; scrollbar-color: #d0d0d0 transparent; }",
                ".log-content::-webkit-scrollbar { width: 6px; }",
                ".log-content::-webkit-scrollbar-track { background: transparent; border-radius: 3px; }",
                ".log-content::-webkit-scrollbar-thumb { background-color: #d0d0d0; border-radius: 3px; border: none; }",
                ".log-content::-webkit-scrollbar-thumb:hover { background-color: #b0b0b0; }",
                ".log-entry { margin-bottom:4px; padding:2px 0; }",
                ".log-entry.success { color:#34a853; }",
                ".log-entry.error { color:#ea4335; }",
                ".log-entry.info { color:#4285f4; }",
                ".log-entry.warning { color:#fbbc04; }",
                ".log-entry.current-list { background: rgba(66,133,244,0.1); border-left: 2px solid #4285f4; padding-left: 4px; }",
                ".progress-section { margin-bottom:8px; }",
                ".progress-bar { width:100%; height:8px; background:#e8eaed; border-radius:4px; overflow:hidden; margin-bottom:8px; }",
                ".progress-fill { height:100%; background:linear-gradient(90deg,#4285f4 0%,#34a853 100%); width:0%; transition: width .3s; border-radius:4px; }",
                ".progress-text { text-align:center; font-size:12px; color:#5f6368; font-weight:500; }",
                ".panel-footer { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:12px 16px; border-top:1px solid #e8eaed; background:#f8f9fa; border-radius:0 0 10px 10px; }",
                ".btn { padding:8px 12px; border:none; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; transition:all .2s; text-align:center; }",
                ".btn:disabled { opacity:.5; cursor:not-allowed; }",
                ".btn-start { background:#34a853; color:white; }",
                ".btn-start:hover:not(:disabled) { background:#2d8f47; transform: translateY(-1px); }",
                ".btn-stop { background:#ea4335; color:white; }",
                ".btn-stop:hover:not(:disabled) { background:#d33b2c; transform: translateY(-1px); }",
                ".btn-export { background:#4285f4; color:white; }",
                ".btn-export:hover:not(:disabled) { background:#3367d6; transform: translateY(-1px); }",
                ".btn-reset { background:#ff9800; color:white; }",
                ".btn-reset:hover:not(:disabled) { background:#f57c00; transform: translateY(-1px); }",
                ".log-entry.current-list { background: rgba(66,133,244,0.1); border-left: 2px solid #4285f4; padding-left: 4px; }",
                ".log-export-dropdown { position:absolute; top:100%; right:0; background:#fff; border:1px solid #ddd; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.1); z-index:10001; display:none; flex-direction:column; width:180px; }",
                ".log-export-dropdown.show { display:flex; }",
                ".log-export-option { padding:8px 12px; cursor:pointer; font-size:11px; white-space:nowrap; border-bottom:1px solid #f5f5f5; }",
                ".log-export-option:hover { background:#f5f5f5; }",
                ".log-export-option:last-child { border-bottom:none; }"
            ];

            const styleContent = document.createTextNode(styleRules.join('\n'));
            styleElement.appendChild(styleContent);
            document.head.appendChild(styleElement);
        } catch (error) {
            console.error('应用样式时出错:', error);
        }
    }

    // 添加日志导出功能
    function addLogExportEvents() {
        try {
            const logExportBtn = document.getElementById('log-export-btn');
            const logClearBtn = document.getElementById('log-clear-btn');
            const dropdown = document.getElementById('log-export-dropdown');

            // 日志导出按钮点击事件 - 打开下拉菜单
            if (logExportBtn) {
                logExportBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.toggle('show');
                });
            }

            // 日志清空按钮点击事件
            if (logClearBtn) {
                logClearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('确定要清空所有日志吗？此操作不可恢复。')) {
                        logManager.clearLogs();
                        dropdown.classList.remove('show');
                    }
                });
            }

            // 下拉选项点击事件
            if (dropdown) {
                dropdown.querySelectorAll('.log-export-option').forEach(option => {
                    option.addEventListener('click', (e) => {
                        const type = e.target.getAttribute('data-type');
                        switch (type) {
                            case 'operation':
                                logManager.exportOperationLog();
                                break;
                            case 'success':
                                logManager.exportSuccessLog();
                                break;
                            case 'error':
                                logManager.exportErrorLog();
                                break;
                            case 'all':
                                logManager.exportAllLogs();
                                break;
                        }
                        dropdown.classList.remove('show');
                    });
                });
            }

            // 点击其他地方关闭下拉菜单
            document.addEventListener('click', () => {
                if (dropdown && dropdown.classList) {
                    dropdown.classList.remove('show');
                }
            });
        } catch (error) {
            console.error('添加日志导出事件时出错:', error);
        }
    }

    // 添加日期过滤事件
    function addDateFilterEvents() {
        try {
            const startDateInput = document.getElementById('start-date');
            const endDateInput = document.getElementById('end-date');

            if (startDateInput && endDateInput) {
                // 监听日期变化
                const updateDateRange = () => {
                    const startDate = startDateInput.value || DATE_CONFIG.getToday();
                    const endDate = endDateInput.value || DATE_CONFIG.getToday();

                    // 简单的校验，确保开始日期不晚于结束日期
                    const startObj = new Date(startDate);
                    const endObj = new Date(endDate);
                    if (startObj > endObj) {
                        logManager.addOperationLog('警告：开始日期晚于结束日期，已自动调整结束日期等于开始日期', 'warning');
                        endDateInput.value = startDate;
                        streamManager.setDateRange(startDate, startDate);
                    } else {
                        streamManager.setDateRange(startDate, endDate);
                    }
                };

                startDateInput.addEventListener('change', updateDateRange);
                endDateInput.addEventListener('change', updateDateRange);

                // 设置默认值并初始化显示
                updateDateRange();
            }
        } catch (error) {
            console.error('添加日期过滤事件时出错:', error);
        }
    }

    function addPanelInteractivity(panel) {
        try {
            const header = panel.querySelector('.panel-header');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            const closeBtn = panel.querySelector('.close-btn');
            const startBtn = document.getElementById('start-btn');
            const stopBtn = document.querySelector('#stop-btn');
            const exportBtn = document.querySelector('#export-btn');
            const resetBtn = document.querySelector('#reset-btn');

            let isDragging = false;
            let dragStartX, dragStartY, initialX, initialY;

            header.addEventListener('mousedown', (e) => {
                if (e.target === minimizeBtn || e.target === closeBtn) return;
                isDragging = true;
                dragStartX = e.clientX; dragStartY = e.clientY;
                initialX = panel.offsetLeft; initialY = panel.offsetTop;
                panel.style.cursor = 'grabbing';
                document.addEventListener('mousemove', onDrag);
                document.addEventListener('mouseup', onDragEnd);
                e.preventDefault();
            });

            function onDrag(e) {
                if (!isDragging) return;
                const deltaX = e.clientX - dragStartX, deltaY = e.clientY - dragStartY;
                let newX = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, initialX + deltaX));
                let newY = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, initialY + deltaY));
                panel.style.left = newX + 'px';
                panel.style.top = newY + 'px';
                panel.style.right = 'auto';
            }

            function onDragEnd() {
                isDragging = false;
                panel.style.cursor = 'move';
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', onDragEnd);
            }

            minimizeBtn.addEventListener('click', () => {
                panel.classList.toggle('minimized');
                minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '−';
            });

            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
                if (isRunning) stopGrabbing();
                streamManager.cleanup();
            });

            if (startBtn) startBtn.addEventListener('click', startGrabbing);
            if (stopBtn) stopBtn.addEventListener('click', stopGrabbing);
            if (exportBtn) exportBtn.addEventListener('click', () => streamManager.exportRemaining());
            if (resetBtn) resetBtn.addEventListener('click', () => {
                streamManager.cleanup();
                grabStats.consecutiveFilteredOutStartDate = 0; // 重置连续过滤计数
                processedCount = 0; // 重置处理计数
                logManager.addOperationLog('流式管理器已重置，日期范围保持不变', 'warning');
                updateButtonStates();
            });
        } catch (error) {
            console.error('添加面板交互性时出错:', error);
        }
    }

    // -------------------- 工具函数 --------------------
    function randomDelay() {
        return Math.random() * (DELAY_MAX - DELAY_MIN) + DELAY_MIN;
    }

    function addLog(message, type = 'info') {
        try {
            const logContent = document.getElementById('grab-log');
            if (!logContent) return;
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + type;

            // 如果是当前候选人列表日志，添加特殊样式类
            if (message.includes('当前可见候选人列表') || message.includes('当前全部候选人列表')) {
                entry.classList.add('current-list');
            }

            const ts = new Date().toLocaleTimeString();

            // 使用安全的文本内容方式，而不是innerHTML
            const textNode = document.createTextNode(`[${ts}] ${message}`);
            entry.appendChild(textNode);
            logContent.appendChild(entry);
            logContent.scrollTop = logContent.scrollHeight;
            const maxEntries = 50;
            if (logContent.children.length > maxEntries) logContent.removeChild(logContent.firstChild);
        } catch (error) {
            console.error('添加日志时出错:', error);
        }
    }

    function updateProgress(processed, currentItem = '') {
        try {
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');
            const statProcessed = document.getElementById('stat-processed');
            const statTotal = document.getElementById('stat-total');
            const statSuccess = document.getElementById('stat-success');

            const successRate = processed > 0 ? Math.round((grabStats.success / processed) * 100) : 0;

            // 动态进度条：估计完成百分比（基于处理数量和最大限制）
            const estimatedPercentage = processed < SELECT_MAX ?
                Math.round((processed / SELECT_MAX) * 100) :
                100;

            if (progressFill) progressFill.style.width = estimatedPercentage + '%';
            if (progressText) progressText.textContent = `正在处理: ${processed} ${currentItem}`;
            if (statProcessed) statProcessed.textContent = processed;

            // 总数显示为"不限"
            if (statTotal) statTotal.textContent = '不限';

            if (statSuccess) statSuccess.textContent = successRate + '%';

            streamManager.updateStreamStats();
        } catch (error) {
            console.error('更新进度时出错:', error);
        }
    }

    function updateTime() {
        try {
            const timeEl = document.getElementById('stat-time');
            if (!timeEl) return;
            if (grabStats.startTime) {
                const elapsed = Math.floor((Date.now() - grabStats.startTime) / 1000);
                const min = Math.floor(elapsed / 60);
                const sec = elapsed % 60;
                timeEl.textContent = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
            } else {
                timeEl.textContent = '0s';
            }
        } catch (error) {
            console.error('更新时间时出错:', error);
        }
    }

    function updateButtonStates() {
        try {
            const startBtn = document.getElementById('start-btn');
            const stopBtn = document.getElementById('stop-btn');
            const exportBtn = document.getElementById('export-btn');
            const resetBtn = document.getElementById('reset-btn');
            if (startBtn) startBtn.disabled = isRunning;
            if (stopBtn) stopBtn.disabled = !isRunning;
            if (exportBtn) exportBtn.disabled = streamManager.getBatchStats().currentBatchSize === 0;
            if (resetBtn) resetBtn.disabled = isRunning || streamManager.getBatchStats().currentBatchSize === 0;
        } catch (error) {
            console.error('更新按钮状态时出错:', error);
        }
    }

    // -------------------- 增强候选人信息获取功能 --------------------
    // 获取所有候选人（不仅限于可见范围）
    function getAllCandidatesInfo() {
        try {
            const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            if (candidates.length === 0) {
                return { first: 0, last: 0, total: 0, names: [] };
            }

            // 获取所有候选人的名字
            const allNames = candidates.map(item => {
                const nameElement = item.querySelector(SELECTORS.name);
                return nameElement ? nameElement.innerText.trim() : '未知';
            });

            return {
                first: 1,
                last: candidates.length,
                total: candidates.length,
                names: allNames
            };
        } catch (error) {
            console.error('获取所有候选人信息时出错:', error);
            return { first: 0, last: 0, total: 0, names: [] };
        }
    }

    // 获取当前视口中实际可见的候选人信息
    function getVisibleCandidatesInfo() {
        try {
            const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            if (candidates.length === 0) {
                return { first: 0, last: 0, total: 0, names: [] };
            }

            // 获取视口可见的候选人
            const visibleCandidates = candidates.filter(candidate => {
                const rect = candidate.getBoundingClientRect();
                return rect.top >= 0 && rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth;
            });

            if (visibleCandidates.length === 0) {
                // 如果没有完全可见的，返回全部范围
                const allNames = candidates.map(item => {
                    const nameElement = item.querySelector(SELECTORS.name);
                    return nameElement ? nameElement.innerText.trim() : '未知';
                });

                return {
                    first: 1,
                    last: candidates.length,
                    total: candidates.length,
                    names: allNames
                };
            }

            // 获取可见候选人的名字
            const visibleNames = visibleCandidates.map(item => {
                const nameElement = item.querySelector(SELECTORS.name);
                return nameElement ? nameElement.innerText.trim() : '未知';
            });

            return {
                first: 1, // 可见列表中的第一个
                last: visibleCandidates.length, // 可见列表中的最后一个
                total: visibleCandidates.length, // 可见候选人总数
                names: visibleNames
            };
        } catch (error) {
            console.error('获取可见候选人信息时出错:', error);
            return { first: 0, last: 0, total: 0, names: [] };
        }
    }

    // 获取当前选中的候选人信息
    function getSelectedCandidateInfo() {
        try {
            // 尝试获取当前选中的候选人
            let selectedCandidate = document.querySelector('.geek-item.selected, [data-id].selected');

            if (!selectedCandidate) {
                // 尝试查找鼠标悬停的候选人
                selectedCandidate = document.querySelector('.geek-item:hover, [data-id]:hover');
            }

            if (!selectedCandidate) {
                // 尝试查找键盘焦点的候选人
                selectedCandidate = document.querySelector('.geek-item:focus, [data-id]:focus');
            }

            // 如果找到了选中的候选人，获取其在列表中的索引和名称
            if (selectedCandidate) {
                const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
                const selectedIndex = candidates.indexOf(selectedCandidate);
                const nameElement = selectedCandidate.querySelector(SELECTORS.name);
                const namePreview = nameElement ? nameElement.innerText.trim() : '未知';

                return {
                    index: selectedIndex + 1, // 转换为1-based
                    name: namePreview,
                    total: candidates.length
                };
            }

            // 如果没有找到选中的候选人，返回默认值
            return {
                index: 0,
                name: '未知',
                total: document.querySelectorAll(SELECTORS.listItem).length
            };
        } catch (error) {
            console.error('获取选中的候选人信息时出错:', error);
            return {
                index: 0,
                name: '未知',
                total: 0
            };
        }
    }

    // 获取页面所有可见候选人姓名列表
    function getAllVisibleCandidateNames() {
        try {
            const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            const names = candidates.map(item => {
                const nameElement = item.querySelector(SELECTORS.name);
                return nameElement ? nameElement.innerText.trim() : '未知';
            });

            return names;
        } catch (error) {
            console.error('获取所有可见候选人姓名时出错:', error);
            return [];
        }
    }

    // 修改：格式化候选人姓名，显示所有可见候选人，不使用省略号
    function formatCandidateNames(names) {
        try {
            if (!names || names.length === 0) return '无候选人';

            // 直接返回所有候选人姓名，不使用省略号
            return names.join(', ');
        } catch (error) {
            console.error('格式化候选人姓名时出错:', error);
            return '格式化错误';
        }
    }

    // 修改：格式化候选人姓名列表，显示所有可见候选人姓名，不使用省略号
    function formatCandidateNamesWithRange(visibleInfo) {
        try {
            if (!visibleInfo || !visibleInfo.names || visibleInfo.names.length === 0) return '无候选人';

            // 直接返回所有可见候选人姓名，不使用省略号
            return visibleInfo.names.join(', ');
        } catch (error) {
            console.error('格式化候选人姓名列表时出错:', error);
            return '格式化错误';
        }
    }

    // -------------------- 候选人解析（修复正则表达式 + 道具信息提取 + 新增字段） --------------------
    function parseCandidate(listItemElement) {
        try {
            const text = (sel, root = listItemElement) => {
                try {
                    const el = (root || document).querySelector(sel);
                    const t = el ? (el.innerText || el.textContent || '').trim() : null;
                    return t ? t.replace(/\s+/g, ' ').trim() : null;
                } catch (e) { return null; }
            };
            const cleanText = (s) => s ? s.replace(/\n\s*\n/g, '\n').trim() : '';

            let id = null;
            for (const a of SELECTORS.idAttr) {
                id = listItemElement.getAttribute(a);
                if (id) break;
            }
            if (!id) id = Date.now().toString();

            const name = text(SELECTORS.name, listItemElement) || 'N/A';
            const position = cleanText(text(SELECTORS.positionList, listItemElement)) || 'N/A';

            let lastMessageRaw = text(SELECTORS.lastMessage, listItemElement) || '';
            // 修复：使用预定义正则，避免语法错误
            let lastMessage = lastMessageRaw.replace(PATTERNS.lastMessageClean, '').replace(/\s+/g, ' ').trim();

            const lastTime = text(SELECTORS.lastTime, listItemElement) || '';
            const lastDate = parseDateFromTime(lastTime);

            const detailRoot = document.querySelector(SELECTORS.detailRoot);

            let age = 'N/A', experience = 'N/A', education = 'N/A', activeStatus = 'N/A', tags = '';

            if (detailRoot) {
                const containers = Array.from(detailRoot.querySelectorAll(SELECTORS.baseInfoElementsContainer));
                let allInfoTexts = [];

                containers.forEach(container => {
                    const items = Array.from(container.querySelectorAll(SELECTORS.baseInfoItems || 'span,div'));
                    let mergedText = '';
                    items.forEach(el => {
                        const t = cleanText(el.innerText || el.textContent);
                        if (!t) return;
                        if (allInfoTexts.includes(t)) return;
                        if (mergedText && /\d年$/.test(mergedText) && /(应届生|实习生|实习|工作经验|工作)/i.test(t)) {
                            const combined = (mergedText + t).replace(/\s+/g, '');
                            allInfoTexts.push(combined);
                            mergedText = '';
                        } else {
                            allInfoTexts.push(t);
                            mergedText = /\d年$/.test(t) ? t : '';
                        }
                    });
                    if (mergedText && !allInfoTexts.includes(mergedText)) allInfoTexts.push(mergedText);
                });

                if (allInfoTexts.length === 0) {
                    Array.from(detailRoot.querySelectorAll('.base-info-single-main span, .base-info-single-main div')).forEach(el => {
                        const t = cleanText(el.innerText || el.textContent);
                        if (t && !allInfoTexts.includes(t)) allInfoTexts.push(t);
                    });
                }

                for (const infoText of allInfoTexts) {
                    if (!infoText) continue;
                    if (age === 'N/A') {
                        const am = infoText.match(PATTERNS.age);
                        if (am) age = am[0];
                    }
                    if (experience === 'N/A') {
                        // 直接尝试匹配完整格式，优先匹配"X年应届生"
                        const fullMatch = infoText.match(/(\d{1,2}年\s*应届生)/);
                        if (fullMatch) {
                            experience = fullMatch[0].trim();
                        } else {
                            let high = infoText.match(/10年以上|多年(?:经验|工作)/i);
                            if (high && high[0]) experience = high[0].trim();
                            else {
                                const ym = infoText.match(/(\d{1,2})年(?:\s*以上)?/);
                                if (ym && ym[0]) {
                                    const n = parseInt(ym[1]);
                                    if (n >= 10) {
                                        if (ym[0].includes('以上') || /高级|资深|主管|经理|负责人|专家|10年/.test(infoText)) experience = n + '年以上';
                                        else experience = ym[0].trim();
                                    } else experience = ym[0].trim();
                                } else if (/应届生/i.test(infoText)) {
                                    const gy = infoText.match(/(\d{2}年)?\s*应届生/);
                                    experience = gy ? gy[0].trim() : '应届生';
                                } else if (/实习生/i.test(infoText)) experience = '实习生';
                            }
                        }
                    }
                    if (education === 'N/A') {
                        const edu = infoText.match(PATTERNS.education);
                        if (edu) education = edu[0];
                    }
                }

                activeStatus = cleanText(text(SELECTORS.activeStatus, detailRoot)) || 'N/A';
                tags = cleanText(text(SELECTORS.tags, detailRoot)) || '';
                if (tags && /牛人分析器|标签/i.test(tags)) tags = '';
            }

            let communicationPosition = position;
            let expect = '', salary = '', location = '', workType = '';

            if (detailRoot) {
                communicationPosition = cleanText(text(SELECTORS.communicationPosition, detailRoot)) || communicationPosition;
                const expectRaw = cleanText(text(SELECTORS.expectArea, detailRoot)) || '';
                if (expectRaw) {
                    expect = expectRaw;
                    const iSalary = text(SELECTORS.salaryInExpect, detailRoot);
                    salary = iSalary || (expect.match(PATTERNS.salary) ? expect.match(PATTERNS.salary)[0] : '');
                    const cleanExpect = expect.replace(/^期望[:：]?\s*/i, '').trim();
                    const parts = cleanExpect.split(/·|•|●|\u00B7/).map(p => p.trim()).filter(Boolean);
                    if (parts.length >= 1) location = parts[0];
                    if (parts.length >= 2) {
                        let rest = parts.slice(1).join(' · ');
                        if (salary) rest = rest.replace(new RegExp(salary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
                        workType = rest;
                    } else {
                        workType = cleanExpect.replace(location, '').replace(salary, '').replace(/·/g, '').trim();
                    }
                    if (workType && salary && workType.includes(salary)) {
                        workType = workType.replace(new RegExp(salary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
                    }
                }
            }

            const workExperience = [];
            const educationExperience = [];

            if (detailRoot) {
                const timeNodes = Array.from(detailRoot.querySelectorAll(SELECTORS.timeNodes));
                const detailNodes = Array.from(detailRoot.querySelectorAll(SELECTORS.detailNodes));
                const minLen = Math.min(timeNodes.length, detailNodes.length);
                for (let i = 0; i < minLen; i++) {
                    const t = (timeNodes[i].innerText || timeNodes[i].textContent || '').trim();
                    const d = (detailNodes[i].innerText || detailNodes[i].textContent || '').trim();
                    if (!t || !d) continue;
                    const isLikelyTime = /^\d{4}(\.\d{1,2})?[-–—]\s*(\d{4}(\.\d{1,2})?|至今)$/.test(t) || /^\d{4}年.*$/.test(t);
                    const isLikelyContent = d.length > 6 && !/期望：|沟通职位：/i.test(d);
                    if (!isLikelyContent) continue;
                    const parts = d.split(/·|•|●|\u00B7/).map(p => p.trim()).filter(Boolean);
                    if (SELECTORS.educationKeywords.test(d)) {
                        const school = parts[0] || 'N/A';
                        const major = parts.length >= 2 ? parts[1] : 'N/A';
                        const degree = parts.length >= 3 ? parts.slice(2).join('·') : education || 'N/A';
                        educationExperience.push({ time: t, content: d, school, major, degree });
                    } else {
                        const company = parts[0] || 'N/A';
                        const job = parts.length >= 2 ? parts.slice(1).join(' · ') : 'N/A';
                        workExperience.push({ time: t, content: d, company, job });
                    }
                }
            }

            const chatRecords = [];
            const convoRoot = document.querySelector(SELECTORS.convoRoot) || document.querySelector(SELECTORS.detailRoot);

            // 新增字段的临时变量
            let from = '';
            let resume = '';
            let weChat = '';
            let firstMessageProcessed = false; // 标记是否处理了第一条非系统消息

            if (convoRoot) {
                const messageItems = Array.from(convoRoot.querySelectorAll(SELECTORS.messageItems));
                let lastValidTime = ''; // 记录最后一个有效时间

                for (const mi of messageItems) {
                    const tEl = mi.querySelector(SELECTORS.messageTime);
                    const rawTime = tEl ? (tEl.innerText || tEl.textContent || '').trim() : '';

                    let content = '';
                    const cardEl = mi.querySelector(SELECTORS.messageCard);
                    if (cardEl) {
                        content = (cardEl.innerText || cardEl.textContent || '').trim();
                    } else {
                        const textEl = mi.querySelector(SELECTORS.messageText) || mi.querySelector('.text') || mi;
                        content = textEl ? (textEl.innerText || textEl.textContent || '').trim() : '';
                    }

                    if (!content) continue;
                    content = content.replace(/\s+/g, ' ').trim();

                    // 🔧 关键修复：时间字段为空时，使用前一个有效时间
                    let finalTime = rawTime;
                    if (!finalTime && lastValidTime) {
                        finalTime = lastValidTime;
                    }

                    // 更新最后有效时间
                    if (finalTime) {
                        lastValidTime = finalTime;
                    }

                    // 为聊天记录时间添加完整日期，使用lastDate作为基础日期
                    const formattedTime = formatChatTimeWithDate(finalTime || 'N/A', lastDate);

                    // 智能判断发送者
                    let sender = 'unknown';
                    if (mi.querySelector(SELECTORS.senderCandidate) || mi.classList.contains('item-friend')) {
                        sender = 'candidate';
                    } else if (mi.querySelector(SELECTORS.senderMyself) || mi.classList.contains('item-myself')) {
                        sender = 'recruiter';
                    } else if (mi.querySelector(SELECTORS.senderSystem) || mi.classList.contains('item-system')) {
                        sender = 'system';
                    } else {
                        // 如果都不匹配，按内容判断
                        const contentElement = mi.querySelector('.text');
                        if (contentElement) {
                            const messageContent = (contentElement.innerText || contentElement.textContent || '').trim();
                            if (/系统|邀请|推荐|该牛人/.test(messageContent)) {
                                sender = 'system';
                            }
                        }
                    }

                    // 获取状态信息
                    let statusText = '';
                    const statusEl = mi.querySelector('.text i.status, i.status');
                    if (statusEl) statusText = (statusEl.innerText || statusEl.textContent || '').trim();

                    if (content.length < 2) continue;

                    // 在系统消息中提取道具信息并临时存储
                    if (sender === 'system') {
                        const singleRecord = { sender, content };
                        const toolInfo = extractToolInfo([singleRecord]);
                        if (toolInfo.toolName || toolInfo.toolReason) {
                            // 将道具信息临时存储，用于后续附加到候选人数据
                            if (!chatRecords.globalToolInfo) chatRecords.globalToolInfo = { toolName: "", toolReason: "" };
                            if (toolInfo.toolName && !chatRecords.globalToolInfo.toolName) {
                                chatRecords.globalToolInfo.toolName = toolInfo.toolName;
                            }
                            if (toolInfo.toolReason && !chatRecords.globalToolInfo.toolReason) {
                                chatRecords.globalToolInfo.toolReason = toolInfo.toolReason;
                            }
                        }

                        // 提取 WeChat
                        if (!weChat) {
                            const weChatMatch = content.match(PATTERNS.weChatId);
                            if (weChatMatch) {
                                weChat = weChatMatch[1];
                            }
                        }
                    } else if (!firstMessageProcessed) { // 仅处理非系统消息的第一条
                        if (sender === 'candidate') {
                            from = '牛人发起';
                        } else if (sender === 'recruiter') {
                            from = '我发起';
                        }
                        firstMessageProcessed = true; // 标记已处理
                    }

                    // 提取 resume (已修正)
                    if (sender === 'candidate' && !resume) {
                        const resumeMatch = content.match(PATTERNS.resumeFileName);
                        if (resumeMatch) {
                            resume = resumeMatch[1].trim().replace(/^[\s:\：\uFEFF"心"''']+|[\s.,\，\。;；:："")）]+$/g, '');
                        }
                    }

                    chatRecords.push({
                        time: formattedTime,  // 使用带日期的时间
                        sender,
                        content,
                        status: statusText || undefined
                    });
                }
            }

            // 构建候选人数据对象
            const candidateData = {
                id,
                name,
                from, // 新增 from 字段
                resume, // 新增 resume 字段
                weChat, // 新增 weChat 字段
                position,
                lastMessage,
                lastDate,
                lastTime,
                age,
                experience,
                education,
                activeStatus,
                tags,
                communicationPosition,
                expect,
                salary,
                location,
                workType,
                workExperience,
                educationExperience,
                chatRecords,
                timestamp: getBeijingTimeString()
            };

            // 添加道具信息 - 优先使用chatRecords中提取的，如果没有则重新提取
            if (chatRecords.globalToolInfo) {
                candidateData.toolName = chatRecords.globalToolInfo.toolName || "";
                candidateData.toolReason = chatRecords.globalToolInfo.toolReason || "";
            } else {
                attachToolInfo(candidateData, chatRecords);
            }

            return candidateData;
        } catch (error) {
            console.error('解析候选人数据时出错:', error);
            return {
                id: Date.now().toString(),
                name: '数据解析错误',
                error: error.message
            };
        }
    }

    // -------------------- 道具信息提取 --------------------
    function extractToolInfo(chatRecords) {
        try {
            let toolName = "";
            let toolReason = "";

            if (!chatRecords) return { toolName, toolReason };

            for (const record of chatRecords) {
                if (!record || !record.content) continue;
                const content = String(record.content).trim();

                // 只处理系统消息
                const isSystem = (record.sender && record.sender.toLowerCase() === 'system') ||
                                /系统|邀请|推荐/.test(content);
                if (!isSystem) continue;

                // 提取工具名称：匹配 "通过XXX邀请" 模式
                // 修复：确保所有特殊字符（如?, +, *）都被正确转义，或者作为字面量字符对待
                const toolNamePattern = /通过\s*([^邀请，,。.\s]+(?:Pro|Plus|插件|工具|炸弹|助手)?)\s*邀请/i;
                const toolNameMatch = content.match(toolNamePattern);
                if (toolNameMatch) {
                    toolName = toolNameMatch[1].trim();
                }

                // 如果没找到，使用更宽松的匹配
                if (!toolName) {
                    const alternativePattern = /(?:由|通过|来自)\s*([^，,。.]{2,30}?)\s*(?:邀请|推荐)/i;
                    const altMatch = content.match(alternativePattern);
                    if (altMatch) toolName = altMatch[1].trim();
                }

                // 提取推荐理由
                const reasonPattern = /(?:推荐理由|推荐理由[：:]|推荐[：:]|原因[：:]|推荐原因[：:])\s*([^，,。.]+)(?:[，,。.]|$)/i;
                const reasonMatch = content.match(reasonPattern);
                if (reasonMatch) {
                    toolReason = reasonMatch[1].trim();
                } else {
                    // 备用匹配：包含推荐相关的描述
                    const reasonHints = content.match(/(与职位匹配度[^，,。.]+|匹配度[^，,。]+)/i);
                    if (reasonHints) toolReason = (toolReason ? toolReason + '；' : '') + reasonHints[0].trim();
                }

                // 清理重复：若推荐理由包含工具名，则去掉工具名
                if (toolName && toolReason && toolReason.indexOf(toolName) !== -1) {
                    toolReason = toolReason.replace(toolName, '').replace(/^[，,。.\s]+/, '').trim();
                }

                // 如果已经找到完整信息，可以退出
                if (toolName && toolReason) break;
            }

            return { toolName: toolName || "", toolReason: toolReason || "" };
        } catch (error) {
            console.error('提取道具信息时出错:', error);
            return { toolName: "", toolReason: "" };
        }
    }

    function attachToolInfo(candidateObj, chatRecords) {
        try {
            if (!candidateObj || typeof candidateObj !== 'object') return candidateObj;
            const info = extractToolInfo(chatRecords);
            candidateObj.toolName = info.toolName || "";
            candidateObj.toolReason = info.toolReason || "";
            return candidateObj;
        } catch (error) {
            console.error('附加道具信息时出错:', error);
            return candidateObj;
        }
    }

    // -------------------- 时间解析 --------------------
    function parseDateFromTime(timeStr) {
        try {
            if (!timeStr || timeStr === 'N/A') return getLocalTodayString();
            const now = new Date();

            // 使用本地年月日计算，避免时区问题
            const localYear = now.getFullYear();
            const localMonth = now.getMonth() + 1;
            const localDate = now.getDate();

            if (timeStr.includes('刚刚') || timeStr.includes('分钟前') || timeStr.includes('秒前') || timeStr.includes('小时前')) {
                return getLocalTodayString();
            }

            if (timeStr.includes('昨天')) {
                // 使用本地日期计算昨天，避免时区问题
                let yesterdayDate = localDate - 1;
                let yesterdayMonth = localMonth;
                let yesterdayYear = localYear;

                if (yesterdayDate < 1) {
                    // 退到上个月
                    yesterdayMonth = localMonth - 1;
                    if (yesterdayMonth < 1) {
                        yesterdayMonth = 12;
                        yesterdayYear = localYear - 1;
                    }
                    const daysInPrevMonth = new Date(yesterdayYear, yesterdayMonth, 0).getDate();
                    yesterdayDate = daysInPrevMonth;
                }

                return `${yesterdayYear}-${String(yesterdayMonth).padStart(2,'0')}-${String(yesterdayDate).padStart(2,'0')}`;
            }

            if (timeStr.includes('前天')) {
                // 前天同样使用本地日期计算
                let dayBeforeYesterdayDate = localDate - 2;
                let dayBeforeYesterdayMonth = localMonth;
                let dayBeforeYesterdayYear = localYear;

                if (dayBeforeYesterdayDate < 1) {
                    // 需要退到前一个月或更早
                    dayBeforeYesterdayMonth = localMonth - 1;
                    if (dayBeforeYesterdayMonth < 1) {
                        dayBeforeYesterdayMonth = 12;
                        dayBeforeYesterdayYear = localYear - 1;
                    }
                    const daysInPrevMonth = new Date(dayBeforeYesterdayYear, dayBeforeYesterdayMonth, 0).getDate();
                    dayBeforeYesterdayDate = daysInPrevMonth + dayBeforeYesterdayDate; // 加上负数
                }

                return `${dayBeforeYesterdayYear}-${String(dayBeforeYesterdayMonth).padStart(2,'0')}-${String(dayBeforeYesterdayDate).padStart(2,'0')}`;
            }

            const mmdd = timeStr.match(/(\d{1,2})-(\d{1,2})/);
            if (mmdd) {
                const m = parseInt(mmdd[1]), d = parseInt(mmdd[2]), y = localYear; // 使用localYear
                return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            }

            const ymd = timeStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (ymd) return `${ymd[1]}-${String(ymd[2]).padStart(2,'0')}-${String(ymd[3]).padStart(2,'0')}`;

            const chinese = timeStr.match(/(\d{1,2})月(\d{1,2})日/);
            if (chinese) {
                const m = parseInt(chinese[1]), d = parseInt(chinese[2]), y = localYear; // 使用localYear
                return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            }

            // 时间合理性检查 - 使用本地日期
            if (/^\d{1,2}[:：]\d{2}$/.test(timeStr.trim())) {
                return getLocalTodayString();
            }

            return getLocalTodayString();
        } catch (error) {
            console.error('解析日期时出错:', error);
            return getLocalTodayString();
        }
    }

    // 为聊天记录时间添加完整日期
    function formatChatTimeWithDate(rawTime, baseDateStr) {
        try {
            if (!rawTime || rawTime === 'N/A') return `${baseDateStr} N/A`;

            let timePart = rawTime.trim();
            // 处理月-日 时:分格式 (如 "10-29 20:16")
            const monthDayTimeMatch = timePart.match(/^(\d{1,2})-(\d{1,2})\s+(\d{1,2}[:：]\d{2}(?::\d{2})?)$/);
            if (monthDayTimeMatch) {
                const month = monthDayTimeMatch[1].padStart(2, '0');
                const day = monthDayTimeMatch[2].padStart(2, '0');
                const time = monthDayTimeMatch[3];
                const currentYear = new Date().getFullYear();
                return `${currentYear}-${month}-${day} ${time}`;
            }

            // 移除可能的数字前缀
            timePart = timePart.replace(/^\d{1,2}[:：]/, '').trim();

            // 处理相对时间
            if (rawTime.includes('前') || rawTime.includes('刚刚') || rawTime.includes('昨天') || rawTime.includes('前天')) {
                const relativeDate = parseDateFromTime(rawTime); // 修复后的函数
                return `${relativeDate} ${rawTime}`;
            }

            // 标准时间格式拼接
            if (/^\d{1,2}[:：]\d{2}(?::\d{2})?$/.test(timePart)) {
                return `${baseDateStr} ${timePart}`;
            }

            // 如果时间格式是纯时间(如"13:29")，使用本地今天作为日期
            if (/^\d{1,2}[:：]\d{2}$/.test(rawTime.trim())) {
                return `${getLocalTodayString()} ${rawTime}`;
            }

            // 其他情况，直接拼接
            return `${baseDateStr} ${rawTime}`;
        } catch (error) {
            console.error('格式化聊天时间时出错:', error);
            return `${baseDateStr} ${rawTime}`;
        }
    }

    // 工具函数 - 获取本地今天的日期字符串
    function getLocalTodayString() {
        try {
            const now = new Date();
            const localYear = now.getFullYear();
            const localMonth = now.getMonth() + 1;
            const localDate = now.getDate();
            return `${localYear}-${String(localMonth).padStart(2, '0')}-${String(localDate).padStart(2, '0')}`;
        } catch (error) {
            console.error('获取本地日期字符串时出错:', error);
            const now = new Date();
            return now.toISOString().split('T')[0];
        }
    }

    // 北京时间
    function getBeijingTimeString() {
        try {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        } catch (error) {
            console.error('获取北京时间时出错:', error);
            return new Date().toISOString();
        }
    }

    // -------------------- 等待/导航/交互 --------------------
    function waitForRightPanelLoad() {
        return new Promise((resolve) => {
            const observer = new MutationObserver((mutations) => {
                let hasNew = false;
                for (const m of mutations) {
                    if (m.type === 'childList' && m.addedNodes.length > 0) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1) {
                                try {
                                    if (node.matches && (node.matches('.base-info-single-main') || node.matches('.conversation-message'))) hasNew = true;
                                } catch(e) {}
                                if ((node.innerText || node.textContent || '').trim().length > 50) hasNew = true;
                            }
                        }
                    }
                }
                if (hasNew) {
                    observer.disconnect();
                    setTimeout(resolve, getDelay(DELAYS.DETAIL_LOAD));
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(); }, getDelay(DELAYS.MAX_WAIT));
        });
    }

    function moveToNextCandidate() {
        try {
            const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true });
            document.dispatchEvent(ev);
            return new Promise(resolve => setTimeout(resolve, getDelay(DELAYS.NAVIGATION)));
        } catch (error) {
            console.error('移动到下一个候选人时出错:', error);
            return Promise.resolve();
        }
    }

    // 修复查询选择器问题
    function findCandidateById(idString) {
        try {
            // 修复：分别尝试 data-id 和 id 属性，而不是使用逗号分隔的选择器
            const candidate = document.querySelector(`[data-id="${idString}"]`);
            if (candidate) return candidate;

            // 尝试 ID 选择器（确保 ID 有效）
            if (/^[a-zA-Z][\w:.-]*$/.test(idString)) {
                return document.querySelector(`#${idString}`);
            }

            return null;
        } catch (error) {
            console.error('查找候选人时出错:', error);
            logManager.addOperationLog(`查找候选人时出错: ${error.message}`, 'error');
            return null;
        }
    }

    // 改进的人工平滑滚动函数 - 更加自然地模拟人类滚动行为
    function smoothScrollElement(element, direction = 'down', distance = 0) {
        return new Promise((resolve) => {
            try {
                if (!element) {
                    resolve();
                    return;
                }

                // 获取滚动容器（可能是直接元素或父元素）
                const scrollContainer = element.closest('.user-list, .geek-list') ||
                                        element.closest('[style*="overflow-y"]') ||
                                        document.querySelector('.job-list-wrap') ||
                                        document.body;

                // 获取当前滚动位置
                const currentScrollTop = scrollContainer.scrollTop;
                let targetScrollTop = currentScrollTop;

                if (direction === 'down') {
                    // 添加滚动距离的随机变化
                    const variance = 1 + (Math.random() * 2 - 1) * SCROLL_CONFIG.SCROLL_VARIANCE; // ±VARIANCE
                    const adjustedDistance = distance * variance;
                    targetScrollTop = currentScrollTop + adjustedDistance;
                } else if (direction === 'up') {
                    const variance = 1 + (Math.random() * 2 - 1) * SCROLL_CONFIG.SCROLL_VARIANCE; // ±VARIANCE
                    const adjustedDistance = distance * variance;
                    targetScrollTop = Math.max(0, currentScrollTop - adjustedDistance);
                }

                // 如果滚动距离太小，直接完成
                if (Math.abs(targetScrollTop - currentScrollTop) < 5) {
                    resolve();
                    return;
                }

                // 偶尔添加轻微向上的滚动，模拟人类浏览时的犹豫
                const shouldOccasionalUpScroll = direction === 'down' && Math.random() < SCROLL_CONFIG.OCCASIONAL_UP_SCROLL;
                if (shouldOccasionalUpScroll) {
                    const upScrollDistance = Math.random() * 30 + 10; // 10-40px 向上
                    targetScrollTop = Math.max(0, currentScrollTop - upScrollDistance);
                }

                // 随机决定滚动步数和延迟，模拟不同速度
                const stepsVariance = 1 + (Math.random() * 2 - 1) * SCROLL_CONFIG.SCROLL_SPEED_VARIANCE;
                const steps = Math.max(10, Math.floor(SCROLL_CONFIG.SMOOTH_SCROLL_STEPS * stepsVariance));
                const stepDelay = SCROLL_CONFIG.SMOOTH_SCROLL_DELAY * (1 + (Math.random() * 2 - 1) * 0.5); // 延迟也有变化

                // 是否添加随机暂停
                const shouldPause = Math.random() < SCROLL_CONFIG.RANDOM_PAUSE_CHANCE;
                let pauseStep = -1;
                let pauseDuration = 0;

                if (shouldPause) {
                    // 随机选择一个中间步骤暂停
                    pauseStep = Math.floor(Math.random() * (steps * 0.7)) + Math.floor(steps * 0.1);
                    pauseDuration = Math.random() * (SCROLL_CONFIG.PAUSE_MAX_DURATION - SCROLL_CONFIG.PAUSE_MIN_DURATION) + SCROLL_CONFIG.PAUSE_MIN_DURATION;
                }

                // 是否添加轻微抖动
                const shouldWobble = Math.random() < SCROLL_CONFIG.OCCASIONAL_WOBBLE;
                const wobbleAmplitude = shouldWobble ? SCROLL_CONFIG.WOBBLE_AMPLITUDE * (Math.random() + 0.5) : 0;
                const wobbleFrequency = SCROLL_CONFIG.WOBBLE_FREQUENCY;

                // 缓动函数，更加自然的滚动曲线
                const easeInOutCubic = (t) => {
                    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                };

                const totalDistance = targetScrollTop - currentScrollTop;
                let currentStep = 0;
                let currentScrollTopTemp = currentScrollTop;

                const scrollInterval = setInterval(() => {
                    currentStep++;
                    const progress = easeInOutCubic(currentStep / steps);
                    let newScrollTop = currentScrollTop + totalDistance * progress;

                    // 添加抖动效果
                    if (shouldWobble && currentStep % wobbleFrequency === 0) {
                        const wobbleDirection = Math.sin(currentStep / 2) > 0 ? 1 : -1;
                        newScrollTop += wobbleDirection * wobbleAmplitude;
                    }

                    scrollContainer.scrollTop = newScrollTop;
                    currentScrollTopTemp = newScrollTop;

                    // 暂停逻辑
                    if (currentStep === pauseStep) {
                        clearInterval(scrollInterval);
                        logManager.addOperationLog(`模拟人类浏览行为：滚动中随机暂停 ${Math.round(pauseDuration)}ms`, 'info');

                        setTimeout(() => {
                            // 恢复滚动
                            const remainingSteps = steps - currentStep;
                            let resumedStep = 0;

                            const resumeInterval = setInterval(() => {
                                resumedStep++;
                                const totalProgress = easeInOutCubic((currentStep + resumedStep) / steps);
                                let resumedScrollTop = currentScrollTop + totalDistance * totalProgress;

                                // 继续添加可能的抖动
                                if (shouldWobble && (currentStep + resumedStep) % wobbleFrequency === 0) {
                                    const wobbleDirection = Math.sin((currentStep + resumedStep) / 2) > 0 ? 1 : -1;
                                    resumedScrollTop += wobbleDirection * wobbleAmplitude;
                                }

                                scrollContainer.scrollTop = resumedScrollTop;

                                if (resumedStep >= remainingSteps) {
                                    clearInterval(resumeInterval);
                                    resolve();
                                }
                            }, stepDelay);
                        }, pauseDuration);
                    } else if (currentStep >= steps) {
                        clearInterval(scrollInterval);
                        resolve();
                    }
                }, stepDelay);
            } catch (error) {
                console.error('人工平滑滚动时出错:', error);
                resolve();
            }
        });
    }

    // 平滑滚动到指定候选人
    function smoothScrollToCandidate(candidate, position = 'center') {
        return new Promise((resolve) => {
            try {
                if (!candidate) {
                    resolve();
                    return;
                }

                // 获取滚动容器
                const scrollContainer = candidate.closest('.user-list, .geek-list') ||
                                        candidate.closest('[style*="overflow-y"]') ||
                                        document.querySelector('.job-list-wrap') ||
                                        document.body;

                // 获取元素在容器中的位置
                const candidateRect = candidate.getBoundingClientRect();
                const containerRect = scrollContainer.getBoundingClientRect();

                // 计算目标滚动位置
                let targetScrollTop;
                const candidateTopInContainer = candidateRect.top - containerRect.top + scrollContainer.scrollTop;

                if (position === 'center') {
                    // 居中显示
                    const containerHeight = scrollContainer.clientHeight;
                    targetScrollTop = candidateTopInContainer - (containerHeight / 2) + (candidateRect.height / 2);
                } else if (position === 'start') {
                    // 顶部显示
                    targetScrollTop = candidateTopInContainer;
                } else {
                    // 默认居中
                    const containerHeight = scrollContainer.clientHeight;
                    targetScrollTop = candidateTopInContainer - (containerHeight / 2) + (candidateRect.height / 2);
                }

                // 确保不超出边界
                targetScrollTop = Math.max(0, Math.min(targetScrollTop, scrollContainer.scrollHeight - scrollContainer.clientHeight));

                // 如果当前滚动位置已经接近目标，直接完成
                const currentScrollTop = scrollContainer.scrollTop;
                if (Math.abs(targetScrollTop - currentScrollTop) < 10) {
                    resolve();
                    return;
                }

                // 使用改进的人工模拟滚动
                const distance = targetScrollTop - currentScrollTop;
                const direction = distance > 0 ? 'down' : 'up';
                smoothScrollElement(scrollContainer, direction, Math.abs(distance)).then(() => {
                    // 滚动完成后额外等待，确保内容稳定
                    setTimeout(resolve, SCROLL_CONFIG.REPOSITION_DELAY);
                });
            } catch (error) {
                console.error('平滑滚动到候选人时出错:', error);
                resolve();
            }
        });
    }

    // 修改后的滚动和定位逻辑 - 使用人工模拟滚动
    async function scrollDownByCandidates(count = 1) {
        return new Promise(async (resolve) => {
            try {
                logManager.addOperationLog(`开始人工模拟向下滚动 ${count} 个候选人位置`, 'info');

                // 获取候选人列表容器
                let listContainer = document.querySelector(SELECTORS.candidatesContainer) ||
                                document.querySelector('.job-list-wrap .user-list') ||
                                document.querySelector('.job-list-wrap');

                if (!listContainer) {
                    // 尝试使用页面级滚动
                    logManager.addOperationLog('未找到候选人列表容器，尝试页面级滚动', 'warning');
                    await smoothScrollElement(document.body, 'down', 300);
                    setTimeout(resolve, getDelay(SCROLL_CONFIG.SCROLL_CHECK_DELAY));
                    return;
                }

                // 获取所有候选人
                const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
                if (candidates.length === 0) {
                    logManager.addOperationLog('未找到候选人元素，停止滚动', 'error');
                    resolve();
                    return;
                }

                // 获取当前选中的候选人
                let currentSelected = document.querySelector('.geek-item.selected, [data-id].selected');
                if (!currentSelected) {
                    currentSelected = document.querySelector('.geek-item:hover, [data-id]:hover');
                }
                if (!currentSelected) {
                    currentSelected = document.querySelector('.geek-item:focus, [data-id]:focus');
                }

                // 如果没有选中的候选人，使用第一个
                if (!currentSelected && candidates.length > 0) {
                    currentSelected = candidates[0];
                }

                if (!currentSelected) {
                    logManager.addOperationLog('无法确定当前候选人，停止滚动', 'error');
                    resolve();
                    return;
                }

                // 获取当前候选人的位置
                const currentIndex = candidates.indexOf(currentSelected);
                const currentName = (currentSelected.querySelector(SELECTORS.name) || {}).innerText || '未知';

                // 修复：计算每个候选人的平均高度
                let avgCandidateHeight = 0;
                if (candidates.length > 1) {
                    // 使用前几个候选人计算平均高度，确保准确性
                    const sampleCount = Math.min(3, candidates.length);
                    let totalHeight = 0;
                    let validSamples = 0;

                    for (let i = 0; i < sampleCount; i++) {
                        const rect = candidates[i].getBoundingClientRect();
                        if (rect.height > 0) {
                            totalHeight += rect.height;
                            validSamples++;
                        }
                    }

                    if (validSamples > 0) {
                        avgCandidateHeight = totalHeight / validSamples;
                    }
                } else if (candidates.length === 1) {
                    avgCandidateHeight = candidates[0].getBoundingClientRect().height;
                }

                // 如果无法计算高度，使用默认值
                if (!avgCandidateHeight || avgCandidateHeight < 50 || isNaN(avgCandidateHeight) || !isFinite(avgCandidateHeight)) {
                    avgCandidateHeight = 100; // 默认候选人高度
                }

                // 修复：计算总滚动距离，并添加上限检查
                const rawScrollDistance = avgCandidateHeight * count;
                const scrollDistance = Math.min(rawScrollDistance, SCROLL_CONFIG.MAX_SCROLL_DISTANCE);

                // 修改：记录滚动信息，但不改变选中的候选人
                logManager.addOperationLog(`保持原候选人 ${currentName}(索引${currentIndex}) 不变，人工模拟向下滚动页面 ${count} 个候选人位置（约${scrollDistance}px）`, 'info');

                // 使用改进的人工模拟滚动，而不是选中并滚动到新候选人
                await smoothScrollElement(listContainer, 'down', scrollDistance);

                // 模拟人类浏览后的短暂停顿，随机时长
                const randomPauseAfterScroll = Math.random() * 500 + 300; // 300-800ms
                setTimeout(() => {
                    logManager.addOperationLog(`模拟人类浏览行为：滚动后随机暂停 ${Math.round(randomPauseAfterScroll)}ms`, 'info');
                }, randomPauseAfterScroll);

                // 等待滚动完成和新内容加载
                setTimeout(resolve, getDelay(SCROLL_CONFIG.SCROLL_CHECK_DELAY) * 2);
            } catch (error) {
                console.error('执行候选人滚动时出错:', error);
                logManager.addOperationLog(`滚动出错: ${error.message}`, 'error');
                resolve();
            }
        });
    }

    // 新增：更可靠的候选人查找函数
    function findCandidateReliably(candidateId, candidateName, originalIndex) {
        try {
            // 方法1：通过ID查找
            if (candidateId) {
                const byId = findCandidateById(candidateId);
                if (byId) {
                    return byId;
                }
            }

            // 方法2：通过名称查找
            if (candidateName) {
                const allCandidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
                for (const candidate of allCandidates) {
                    const nameElement = candidate.querySelector(SELECTORS.name);
                    const name = nameElement ? nameElement.innerText.trim() : '';
                    if (name === candidateName) {
                        return candidate;
                    }
                }
            }

            // 方法3：通过索引查找
            const allCandidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            if (originalIndex >= 0 && originalIndex < allCandidates.length) {
                return allCandidates[originalIndex];
            }

            // 方法4：通过相对位置查找（查找在可见列表中相似位置的候选人）
            const visibleCandidates = allCandidates.filter(candidate => {
                const rect = candidate.getBoundingClientRect();
                return rect.top >= 0 && rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth;
            });

            if (visibleCandidates.length > 0) {
                // 如果知道原始候选人在可见列表中的位置，尝试返回相应位置的候选人
                // 这里简化处理，返回可见列表中的第7个（因为通常是在处理第8个时滚动）
                const targetVisibleIndex = Math.min(6, visibleCandidates.length - 1);
                return visibleCandidates[targetVisibleIndex];
            }

            // 最后返回可见列表中的最后一个候选人
            return visibleCandidates.length > 0 ? visibleCandidates[visibleCandidates.length - 1] : null;
        } catch (error) {
            console.error('可靠查找候选人时出错:', error);
            logManager.addOperationLog(`可靠查找候选人出错: ${error.message}`, 'error');
            return null;
        }
    }

    // 智能检测已选中候选人
    function moveToFirstCandidate() {
        return new Promise((resolve) => {
            try {
                setTimeout(() => {
                    // 🔍 优先检测当前已选中的候选人
                    let currentSelected = document.querySelector('.geek-item.selected, [data-id].selected, .geek-item:hover, [data-id]:hover, .geek-item.active, [data-id].active');

                    // 如果没有找到严格选中的，尝试查找鼠标悬停的
                    if (!currentSelected) {
                        const hovered = document.querySelector('.geek-item:hover, [data-id]:hover');
                        if (hovered) currentSelected = hovered;
                    }

                    // 如果还是没有，尝试查找键盘焦点
                    if (!currentSelected) {
                        const focused = document.querySelector('.geek-item:focus, [data-id]:focus');
                        if (focused) currentSelected = focused;
                    }

                    if (currentSelected) {
                        // ✅ 找到了已选中的候选人从这个开始
                        logManager.addOperationLog(`检测到已选中候选人: ${(currentSelected.querySelector(SELECTORS.name) || {}).innerText || '未知'}，从这个位置开始抓取`, 'info');

                        // 使用平滑滚动而不是直接滚动
                        smoothScrollToCandidate(currentSelected, 'center').then(() => {
                            setTimeout(() => {
                                // 确认该候选人被正确选中
                                const rect = currentSelected.getBoundingClientRect();
                                const centerX = rect.left + rect.width / 2;
                                const centerY = rect.top + rect.height / 2;

                                // 模拟点击确保选中状态
                                const mouseEvents = ['mouseover', 'mousedown', 'mouseup', 'click'];
                                mouseEvents.forEach((etype, idx) => {
                                    const ev = new MouseEvent(etype, {
                                        bubbles: true,
                                        cancelable: true,
                                        view: window,
                                        clientX: centerX,
                                        clientY: centerY,
                                        button: 0,
                                        buttons: 1
                                    });
                                    currentSelected.dispatchEvent(ev);
                                    // 增加事件间隔
                                    setTimeout(() => {}, 50);
                                });

                                setTimeout(() => {
                                    const detailPanel = document.querySelector(SELECTORS.detailRoot);
                                    if (detailPanel) {
                                        logManager.addOperationLog('从已选中候选人开始处理，详情面板已打开', 'success');
                                    } else {
                                        logManager.addOperationLog('从已选中候选人开始，详情面板未打开，继续执行', 'warning');
                                    }
                                    resolve();
                                }, getDelay(DELAYS.FIRST_CANDIDATE_CLICK));
                            }, getDelay(DELAYS.TRANSITION));
                        });
                    } else {
                        // ❌ 没有找到已选中的候选人，从第一个开始
                        logManager.addOperationLog('未检测到已选中的候选人，从列表第一个开始', 'info');

                        // 根据新的HTML结构查找候选人
                        const candidates = document.querySelectorAll(SELECTORS.listItem);
                        if (candidates && candidates.length > 0) {
                            const first = candidates[0];

                            // 清除其他候选人的选中状态
                            candidates.forEach(it => it.classList.remove('selected', 'hover', 'active'));
                            first.classList.add('selected');

                            // 使用平滑滚动而不是直接滚动
                            smoothScrollToCandidate(first, 'center').then(() => {
                                setTimeout(() => {
                                    const rect = first.getBoundingClientRect();
                                    const centerX = rect.left + rect.width / 2;
                                    const centerY = rect.top + rect.height / 2;
                                    const mouseEvents = ['mouseover', 'mousedown', 'mouseup', 'click'];
                                    mouseEvents.forEach((etype, idx) => {
                                        const ev = new MouseEvent(etype, {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window,
                                            clientX: centerX,
                                            clientY: centerY,
                                            button: 0,
                                            buttons: 1
                                        });
                                        first.dispatchEvent(ev);
                                    });

                                    setTimeout(() => {
                                        const detailPanel = document.querySelector(SELECTORS.detailRoot);
                                        if (detailPanel) {
                                            logManager.addOperationLog('成功选中第一个候选人并打开详情面板', 'success');
                                            resolve();
                                        } else {
                                            first.click();
                                            setTimeout(() => {
                                                const check = document.querySelector(SELECTORS.detailRoot);
                                                if (check) {
                                                    logManager.addOperationLog('重试后成功打开详情面板', 'success');
                                                    resolve();
                                                } else {
                                                    logManager.addOperationLog('第一个候选人选中但详情面板未打开，继续执行', 'warning');
                                                    resolve();
                                                }
                                            }, getDelay(DELAYS.FIRST_CANDIDATE_RETRY));
                                        }
                                    }, getDelay(DELAYS.FIRST_CANDIDATE_CLICK));
                                }, getDelay(DELAYS.TRANSITION));
                            });
                        } else {
                            logManager.addOperationLog('未找到候选人元素，使用键盘导航', 'warning');
                            const homeEv = new KeyboardEvent('keydown', { key: 'Home', code: 'Home', keyCode: 36, bubbles: true, cancelable: true });
                            document.dispatchEvent(homeEv);
                            setTimeout(() => {
                                const ad = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true });
                                document.dispatchEvent(ad);
                                setTimeout(resolve, getDelay(DELAYS.HOME_KEY_DELAY));
                            }, getDelay(DELAYS.HOME_KEY_DELAY));
                        }
                    }
                }, getDelay(DELAYS.FIRST_CANDIDATE_SETUP));
            } catch (error) {
                console.error('移动到第一个候选人时出错:', error);
                logManager.addOperationLog(`移动到第一个候选人时出错: ${error.message}`, 'error');
                resolve();
            }
        });
    }

    // 修复后的候选人处理函数，确保可见候选人列表显示与实际处理位置一致
    async function processCandidateWithKeyboardAutoDetail() {
        try {
            await new Promise(r => setTimeout(r, getDelay(DELAYS.MAIN_PROCESS)));

            // 🔍 智能检测当前选中的候选人 - 优先级从高到低
            let currentItem = document.querySelector('.geek-item.selected, [data-id].selected');

            if (!currentItem) {
                // 尝试查找鼠标悬停的候选人
                currentItem = document.querySelector('.geek-item:hover, [data-id]:hover');
            }

            if (!currentItem) {
                // 尝试查找键盘焦点的候选人
                currentItem = document.querySelector('.geek-item:focus, [data-id]:focus');
            }

            if (!currentItem) {
                // 根据新的HTML结构查找候选人
                const candidates = document.querySelectorAll(SELECTORS.listItem);
                if (candidates && candidates.length > 0) {
                    currentItem = candidates[0];
                    logManager.addOperationLog('未检测到选中状态，默认使用第一个候选人', 'info');
                } else {
                    logManager.addOperationLog('未找到任何候选人元素，停止处理', 'error');
                    return;
                }
            }

            // 获取当前选中的候选人在所有候选人中的索引和名称
            const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            const globalIndex = candidates.indexOf(currentItem);
            const nameElement = currentItem.querySelector(SELECTORS.name);
            const namePreview = nameElement ? nameElement.innerText.trim() : '未知';

            // 获取所有候选人信息（用于调试和日志）
            const allInfo = getAllCandidatesInfo();

            // 获取当前可见候选人信息
            const visibleInfo = getVisibleCandidatesInfo();
            const formattedNames = formatCandidateNamesWithRange(visibleInfo);

            // 更新：同时获取全部候选人列表并格式化显示
            const allNames = formatCandidateNames(allInfo.names);

            // 输出详细的候选人信息 - 修改1：新增全部候选人列表日志
            logManager.addOperationLog(`当前可见候选人列表: 第${visibleInfo.first}个到第${visibleInfo.last}个 [共${visibleInfo.total}人]：${formattedNames}`, 'info');
            logManager.addOperationLog(`当前全部候选人列表: 第${allInfo.first}个到第${allInfo.last}个 [共${allInfo.total}人]：${allNames}`, 'info');

            // 输出详细的候选人信息 - 修改2：增强处理位置信息
            const visibleCandidates = candidates.filter(candidate => {
                const rect = candidate.getBoundingClientRect();
                return rect.top >= 0 && rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth;
            });

            // 获取当前候选人在可见列表中的位置
            const visibleIndex = visibleCandidates.indexOf(currentItem) + 1; // 转换为1-based

            // 增强的处理位置信息：同时显示可见和全部列表中的位置
            logManager.addOperationLog(`处理 [可见第${visibleIndex}个][全部第${globalIndex + 1}个]: ${namePreview}`, 'info');

            try {
                await waitForRightPanelLoad();

                // 滚动聊天记录到最开头 - 修改为模拟人工滚动
                const convoRoot = document.querySelector(SELECTORS.convoRoot);
                if (convoRoot) {
                    // 计算当前滚动位置和需要滚动的距离
                    const currentScrollTop = convoRoot.scrollTop;
                    const scrollDistance = Math.abs(currentScrollTop);

                    if (scrollDistance > 5) {
                        logManager.addOperationLog('使用人工模拟滚动聊天记录到顶部', 'info');
                        await smoothScrollElement(convoRoot, 'up', scrollDistance);
                    } else {
                        logManager.addOperationLog('聊天记录已在顶部附近，跳过滚动', 'info');
                    }

                    // 新增：拟人化聊天记录读取功能
                    // 随机选择一种阅读模式，优先使用线性阅读
                    const readingMode = Math.random() < 0.6 ? CHAT_READING_CONFIG.MODES.LINEAR :
                                      Math.random() < 0.8 ? CHAT_READING_CONFIG.MODES.RECENT :
                                      Math.random() < 0.9 ? CHAT_READING_CONFIG.MODES.RANDOM_JUMP :
                                      CHAT_READING_CONFIG.MODES.DEEP_SCAN;

                    const modeConfig = CHAT_READING_CONFIG.MODE_CONFIGS[readingMode];
                    logManager.addOperationLog(`拟人化阅读模式: ${modeConfig.name}`, 'info');

                    await simulateHumanReading(convoRoot, readingMode);

                    await new Promise(resolve => setTimeout(resolve, getDelay(DELAYS.SCROLL_WAIT)));
                } else {
                    logManager.addOperationLog('未找到聊天记录容器，跳过滚动', 'warning');
                }

                const candidateData = parseCandidate(currentItem);
                grabStats.processed++;
                processedCount++;
                grabStats.success++;
                streamManager.addData(candidateData);

                // 输出详细信息到日志
                let logMessage = `成功抓取: ${candidateData.name} - 经验: ${candidateData.experience} - 日期: ${candidateData.lastDate}`;
                if (candidateData.toolName || candidateData.toolReason) {
                    logMessage += ` | 道具: ${candidateData.toolName || '无'} | 理由: ${candidateData.toolReason || '无'}`;
                }
                if (candidateData.from) {
                    logMessage += ` | 发起: ${candidateData.from}`;
                }
                if (candidateData.resume) {
                    logMessage += ` | 简历: ${candidateData.resume}`;
                }
                if (candidateData.weChat) {
                    logMessage += ` | 微信: ${candidateData.weChat}`;
                }
                logManager.addOperationLog(logMessage, 'success');
                console.log('抓取到：', candidateData);

                await goBackToList();
                updateProgress(grabStats.processed, candidateData.name);
            } catch (error) {
                grabStats.failed++;
                logManager.addOperationLog(`处理失败: ${namePreview} - ${error.message}`, 'error');
                logManager.addErrorLog(namePreview, error);
                console.error(error);
                await goBackToList();
            }

            await new Promise(r => setTimeout(r, getDelay(DELAYS.MAIN_PROCESS) + Math.random() * getDelay(DELAYS.RANDOM_EXTRA)));
        } catch (error) {
            console.error('处理候选人时出错:', error);
            logManager.addOperationLog(`处理候选人时出错: ${error.message}`, 'error');
            await goBackToList();
        }
    }

    function goBackToList() {
        return new Promise((resolve) => {
            try {
                const backButton = document.querySelector('.back-btn, [class*="back"], .icon-back');
                if (backButton) {
                    backButton.click();
                    setTimeout(resolve, getDelay(DELAYS.BACK_BUTTON_DELAY));
                } else {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                    setTimeout(resolve, getDelay(DELAYS.BACK_BUTTON_DELAY));
                }
            } catch (error) {
                console.error('返回列表时出错:', error);
                logManager.addOperationLog(`返回列表时出错: ${error.message}`, 'error');
                resolve();
            }
        });
    }

    // -------------------- 主程序控制逻辑 --------------------
    // 新增辅助函数 - 获取当前选中的候选人信息
    function getCurrentCandidateIndex() {
        try {
            // 根据新的HTML结构获取候选人
            const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            if (candidates.length === 0) return { index: -1, candidate: null };

            // 优先检测严格选中的候选人
            let currentSelected = document.querySelector('.geek-item.selected, [data-id].selected');

            if (!currentSelected) {
                // 尝试查找鼠标悬停的候选人
                currentSelected = document.querySelector('.geek-item:hover, [data-id]:hover');
            }

            if (!currentSelected) {
                // 尝试查找键盘焦点的候选人
                currentSelected = document.querySelector('.geek-item:focus, [data-id]:focus');
            }

            if (currentSelected) {
                const index = candidates.indexOf(currentSelected);
                if (index !== -1) {
                    return { index: index, candidate: currentSelected };
                }
            }

            // 默认返回第一个候选人的信息
            if (candidates.length > 0) {
                return { index: 0, candidate: candidates[0] };
            }

            return { index: -1, candidate: null };
        } catch (error) {
            console.error('获取当前候选人索引时出错:', error);
            return { index: -1, candidate: null };
        }
    }

    // ------------------------- 主流程 - 修复后的抓取流程 -------------------------
    // 修改后的主抓取循环 - 支持平滑滚动逻辑
    async function grabAllCandidates() {
        try {
            logManager.addOperationLog('开始人工模拟滚动模式抓取...', 'info');
            await moveToFirstCandidate();
            await new Promise(r => setTimeout(r, getDelay(DELAYS.NAVIGATION)));

            // 不再计算总数
            grabStats.total = 0;

            // 🔍 获取起始位置信息
            const startInfo = getCurrentCandidateIndex();
            let currentIndex = startInfo.index;
            const startCandidate = startInfo.candidate;
            const startName = (startCandidate.querySelector(SELECTORS.name) || {}).innerText || '未知';

            // 获取候选人列表容器
            const candidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
            const totalCandidatesCount = candidates.length;

            // 获取当前可见候选人信息
            const visibleInfo = getVisibleCandidatesInfo();
            const formattedNames = formatCandidateNamesWithRange(visibleInfo);

            logManager.addOperationLog(`从第${currentIndex + 1}个开始抓取: ${startName}`, 'info');
            logManager.addOperationLog(`当前可见候选人列表: 第${visibleInfo.first}个到第${visibleInfo.last}个 [共${visibleInfo.total}人]：${formattedNames}`, 'info');

            updateProgress(0);

            // 修改后的抓取循环 - 使用人工模拟滚动逻辑
            while (isRunning && processedCount < SELECT_MAX) {
                // 修改停止抓取的条件：只检查连续 lastDate < startDate 的次数
                if (grabStats.consecutiveFilteredOutStartDate >= MAX_CONSECUTIVE_FILTERED_OUT_START_DATE) {
                    const dateRange = streamManager.getDateRange();
                    logManager.addOperationLog(`连续 ${MAX_CONSECUTIVE_FILTERED_OUT_START_DATE} 次候选人因最后沟通日期早于开始日期 (${dateRange.startDate}) 被跳过，停止抓取。`, 'warning');
                    isRunning = false; // 停止抓取
                    break;
                }

                // 每次处理候选人前，先检查并记录当前可见候选人列表
                const currentVisibleInfo = getVisibleCandidatesInfo();
                const formattedVisibleNames = formatCandidateNamesWithRange(currentVisibleInfo);
                logManager.addOperationLog(`当前可见候选人列表: 第${currentVisibleInfo.first}个到第${currentVisibleInfo.last}个 [共${currentVisibleInfo.total}人]：${formattedVisibleNames}`, 'info');

                // 获取当前选中的候选人
                let currentCandidate = document.querySelector('.geek-item.selected, [data-id].selected');
                if (!currentCandidate) {
                    currentCandidate = document.querySelector('.geek-item:hover, [data-id]:hover');
                }
                if (!currentCandidate) {
                    currentCandidate = document.querySelector('.geek-item:focus, [data-id]:focus');
                }

                let currentName = '';
                if (currentCandidate) {
                    currentName = (currentCandidate.querySelector(SELECTORS.name) || {}).innerText || '未知';
                }

                // 🔧 关键修改：实现人工模拟滚动逻辑
                // 当处理到当前可见列表中的第8个候选人时，向下滚动4个候选人，但仍然保持当前选中候选人为原来的第8个
                if (currentCandidate) {
                    // 获取当前候选人在所有候选人列表中的索引
                    const allCandidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
                    const globalIndex = allCandidates.indexOf(currentCandidate);

                    // 获取当前可见的候选人列表
                    const visibleCandidates = allCandidates.filter(candidate => {
                        const rect = candidate.getBoundingClientRect();
                        return rect.top >= 0 && rect.left >= 0 &&
                            rect.bottom <= window.innerHeight &&
                            rect.right <= window.innerWidth;
                    });

                    // 获取当前候选人在可见列表中的位置
                    const visibleIndex = visibleCandidates.indexOf(currentCandidate);

                    // 检查是否在滚动触发位置（可见列表中的第8个人，索引为7）
                    if (visibleIndex >= SCROLL_CONFIG.PROCESS_BEFORE_SCROLL - 1) {
                        logManager.addOperationLog(`处理到可见列表第${SCROLL_CONFIG.PROCESS_BEFORE_SCROLL}个候选人(${currentName})，触发人工模拟滚动`, 'info');

                        // 保存当前候选人信息以便滚动后重新定位
                        let currentCandidateId = null;
                        const dataIdAttr = currentCandidate.getAttribute('data-id');
                        if (dataIdAttr && dataIdAttr.trim()) {
                            currentCandidateId = dataIdAttr.trim();
                        } else {
                            const idAttr = currentCandidate.id;
                            if (idAttr && idAttr.trim()) {
                                currentCandidateId = idAttr.trim();
                            }
                        }

                        const currentCandidateName = currentName;

                        // 向下人工模拟滚动指定数量的候选人 - 不改变当前选中候选人
                        await scrollDownByCandidates(SCROLL_CONFIG.SCROLL_BY_COUNT);

                        // 等待滚动完成和新内容加载
                        await new Promise(resolve => setTimeout(resolve, getDelay(SCROLL_CONFIG.SCROLL_CHECK_DELAY) * 2));

                        // 修改：不再重新定位候选人，因为我们已经保持在原候选人位置
                        logManager.addOperationLog(`人工模拟滚动完成，当前候选人保持为 ${currentCandidateName}，继续处理`, 'info');
                    }
                }

                // 处理当前候选人
                await processCandidateWithKeyboardAutoDetail();
                updateButtonStates();

                // 更新索引
                currentIndex++;

                // 常规移动到下一个候选人（无论是否发生了滚动）
                await moveToNextCandidate();
                await new Promise(r => setTimeout(r, getDelay(DELAYS.NAVIGATION)));

                // 检查是否达到最大处理数量
                if (processedCount >= SELECT_MAX) {
                    logManager.addOperationLog(`已达到最大处理数量 ${SELECT_MAX}，停止抓取`, 'info');
                    break;
                }

                // 检查是否到达列表末尾
                const allCandidates = Array.from(document.querySelectorAll(SELECTORS.listItem));
                const lastCandidate = allCandidates[allCandidates.length - 1];
                const selectedCandidate = document.querySelector('.geek-item.selected, [data-id].selected');

                if (selectedCandidate === lastCandidate) {
                    logManager.addOperationLog('已到达列表末尾，停止抓取', 'info');
                    break;
                }
            }

            if (!isRunning) logManager.addOperationLog('抓取被用户停止或因连续最小沟通日期不符而停止', 'info');
            else logManager.addOperationLog(`抓取结束：成功 ${grabStats.success}，失败 ${grabStats.failed}，总抓取 ${processedCount}`, 'success');
        } catch (err) {
            logManager.addOperationLog(`抓取失败: ${err.message}`, 'error');
            console.error(err);
        } finally {
            isRunning = false;
            updateButtonStates();
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        }
    }

    // -------------------- 启停 导出等 --------------------
    function startGrabbing() {
        try {
            if (isRunning) return;
            isRunning = true;
            grabStats.startTime = Date.now();
            grabStats.processed = 0;
            processedCount = 0; // 重置新的处理计数
            grabStats.success = 0;
            grabStats.failed = 0;
            grabStats.total = 0;
            grabStats.consecutiveFilteredOutStartDate = 0; // 启动时重置连续过滤计数

            const logContent = document.getElementById('grab-log');
            if (logContent) {
                // 安全地清空内容，使用DOM方法而不是innerHTML
                while (logContent.firstChild) {
                    logContent.removeChild(logContent.firstChild);
                }
            }

            // 重置统计
            streamManager.cleanup();
            logManager.operationLog = [];
            logManager.successLog = [];
            logManager.errorLog = [];

            logManager.addOperationLog(`开始人工模拟滚动模式抓取候选人数据（v${SCRIPT_VERSION}）...`, 'info');
            const dateRange = streamManager.getDateRange();
            logManager.addOperationLog(`沟通日期范围设置为: ${dateRange.startDate} 到 ${dateRange.endDate}`, 'info');
            logManager.addOperationLog(`当处理到可见列表第${SCROLL_CONFIG.PROCESS_BEFORE_SCROLL}个候选人时，向下人工模拟滚动${SCROLL_CONFIG.SCROLL_BY_COUNT}个候选人，保持当前候选人位置不变`, 'info');
            logManager.addOperationLog(`人工模拟滚动配置：滚动变化率±${Math.round(SCROLL_CONFIG.SCROLL_VARIANCE*100)}%，${Math.round(SCROLL_CONFIG.OCCASIONAL_UP_SCROLL*100)}%概率轻微向上滚动，${Math.round(SCROLL_CONFIG.RANDOM_PAUSE_CHANCE*100)}%概率随机暂停，${Math.round(SCROLL_CONFIG.OCCASIONAL_WOBBLE*100)}%概率添加轻微抖动`, 'info');
            logManager.addOperationLog(`新增拟人化聊天记录读取功能，支持四种阅读模式：线性阅读、随机跳跃式阅读、浏览最近消息和深度扫描`, 'info');
            logManager.addOperationLog(`拟人化阅读配置：阅读速度变化率±${Math.round(CHAT_READING_CONFIG.READING_SPEED.VARIANCE*100)}%，${Math.round(CHAT_READING_CONFIG.PAUSE_CONFIG.CHANCE*100)}%概率随机暂停，${Math.round(CHAT_READING_CONFIG.MOUSE_MOVEMENT.CHANCE*100)}%概率模拟鼠标移动，${Math.round(CHAT_READING_CONFIG.SCROLL_BACK_CONFIG.CHANCE*100)}%概率回滚阅读`, 'info');
            logManager.addOperationLog(`如果连续 ${MAX_CONSECUTIVE_FILTERED_OUT_START_DATE} 次候选人因最后沟通日期早于开始日期被跳过，将自动停止抓取。`, 'info');
            updateButtonStates();

            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTime, DELAYS.TIME_UPDATE_INTERVAL);

            grabAllCandidates().then(() => {
                if (isRunning) { // 只有正常完成才提示导出剩余
                    logManager.addOperationLog('抓取流程已完成，导出剩余数据...', 'success');
                    streamManager.exportRemaining();
                }
            }).catch(err => {
                logManager.addOperationLog(`抓取流程异常结束: ${err.message}`, 'error');
                console.error(err);
                streamManager.exportRemaining(); // 异常结束也尝试导出剩余
            }).finally(() => {
                isRunning = false;
                updateButtonStates();
                if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                updateProgress(grabStats.processed);
                grabStats.startTime = null;
                streamManager.updateStreamStats();
            });
        } catch (error) {
            console.error('开始抓取时出错:', error);
            logManager.addOperationLog(`开始抓取时出错: ${error.message}`, 'error');
        }
    }

    function stopGrabbing() {
        try {
            if (!isRunning) return;
            isRunning = false;
            logManager.addOperationLog('抓取已停止，导出剩余批次...', 'info');
            streamManager.exportRemaining();
            updateButtonStates();
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        } catch (error) {
            console.error('停止抓取时出错:', error);
            logManager.addOperationLog(`停止抓取时出错: ${error.message}`, 'error');
        }
    }

    // -------------------- 初始化 --------------------
    function init() {
        try {
            console.log('waitForPageLoad...');
            function waitForPageLoad() {
                return new Promise((resolve) => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        window.addEventListener('load', resolve);
                    }
                });
            }

            waitForPageLoad().then(() => {
                logManager.addOperationLog('页面已完全加载，开始初始化...', 'info');

                createFloatingPanel();
                updateButtonStates();
                streamManager.updateStreamStats();
                logManager.addOperationLog(`面板已加载，随时开始抓取（v${SCRIPT_VERSION}）`, 'info');
                const dateRange = streamManager.getDateRange();
                logManager.addOperationLog(`默认沟通日期范围: ${dateRange.startDate} 到 ${dateRange.endDate}`, 'info');
                logManager.addOperationLog(`人工模拟滚动配置: 当处理到可见列表第${SCROLL_CONFIG.PROCESS_BEFORE_SCROLL}个候选人时，向下人工模拟滚动${SCROLL_CONFIG.SCROLL_BY_COUNT}个候选人，保持当前候选人位置不变，最大滚动距离限制为${SCROLL_CONFIG.MAX_SCROLL_DISTANCE}px`, 'info');
                logManager.addOperationLog(`人工模拟滚动特性：滚动距离变化率±${Math.round(SCROLL_CONFIG.SCROLL_VARIANCE*100)}%，${Math.round(SCROLL_CONFIG.OCCASIONAL_UP_SCROLL*100)}%概率轻微向上滚动，${Math.round(SCROLL_CONFIG.RANDOM_PAUSE_CHANCE*100)}%概率随机暂停，${Math.round(SCROLL_CONFIG.OCCASIONAL_WOBBLE*100)}%概率添加轻微抖动`, 'info');
                logManager.addOperationLog(`新增拟人化聊天记录读取功能，支持四种阅读模式：线性阅读、随机跳跃式阅读、浏览最近消息和深度扫描`, 'info');
                logManager.addOperationLog(`拟人化阅读配置：阅读速度变化率±${Math.round(CHAT_READING_CONFIG.READING_SPEED.VARIANCE*100)}%，${Math.round(CHAT_READING_CONFIG.PAUSE_CONFIG.CHANCE*100)}%概率随机暂停，${Math.round(CHAT_READING_CONFIG.MOUSE_MOVEMENT.CHANCE*100)}%概率模拟鼠标移动，${Math.round(CHAT_READING_CONFIG.SCROLL_BACK_CONFIG.CHANCE*100)}%概率回滚阅读`, 'info');

                // === 获取用户名 ===
                const userNameElement = document.querySelector('.user-name');
                if (userNameElement) {
                    recruiterName = userNameElement.innerText.trim();
                    logManager.addOperationLog(`✅ 已检测到用户: ${recruiterName}`, 'success');
                } else {
                    logManager.addOperationLog('⚠️ 未找到用户名元素，使用默认值', 'warning');
                }

                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
                        e.preventDefault();
                        if (isRunning) stopGrabbing();
                        else startGrabbing();
                    }
                });

                setInterval(updateButtonStates, DELAYS.UI_UPDATE_INTERVAL);
            });
        } catch (error) {
            console.error('初始化时出错:', error);
        }
    }

    // 启动 - 修改延迟为4000毫秒
    setTimeout(() => {
        console.log('延迟4秒后开始初始化...');
        try {
            init();
        } catch (error) {
            console.error('启动初始化时出错:', error);
        }
    }, 4000);

})();
