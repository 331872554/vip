/**
 * 导入所需的模块
 */
const express = require('express');          // Express web 框架
const path = require('path');               // 处理文件路径
const multer = require('multer');           // 处理文件上传
const fs = require('fs');                   // 文件系统操作
const compression = require('compression');  // 响应压缩
const helmet = require('helmet');           // 安全中间件
const app = express();                      // 创建 Express 应用

/**
 * 创建日志目录和文件
 */
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// 重定向控制台输出到文件
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function() {
    const args = Array.from(arguments);
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    logStream.write(`[${new Date().toISOString()}] INFO: ${message}\n`);
};

console.error = function() {
    const args = Array.from(arguments);
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    logStream.write(`[${new Date().toISOString()}] ERROR: ${message}\n`);
};

/**
 * 中间件配置
 */
// 配置请求体解析
app.use(express.json({ limit: '500mb' }));  // JSON 解析，设置大小限制
app.use(express.urlencoded({ limit: '500mb', extended: true }));  // URL 编码解析

// 启用响应压缩
app.use(compression());

// 配置安全头
app.use(helmet({
    contentSecurityPolicy: false, // 允许加载外部资源
}));

// 在 server.js 中添加缓存控制中间件
// 添加在其他中间件之后，路由处理之前
app.use((req, res, next) => {
    // 设置缓存控制头
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

/**
 * 文件路径配置
 */
const basePath = process.env.BASE_PATH || __dirname;
const uploadPath = path.join(__dirname, 'uploads');

// 设置文件系统操作的默认编码
const FILE_ENCODING = 'utf8';

/**
 * 创建上传目录
 * 如果目录不存在则创建
 */
if (!fs.existsSync(uploadPath)) {
    try {
        fs.mkdirSync(uploadPath, { recursive: true });
        // 检查目录是否创建成功
        if (fs.existsSync(uploadPath)) {
            console.log('上传目录创建成功:', uploadPath);
            // 测试写入权限
            const testFile = path.join(uploadPath, 'test.txt');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log('上传目录权限正常');
        } else {
            throw new Error('目录创建失败');
        }
    } catch (error) {
        console.error('创建上传目录失败:', error);
        console.error('错误详情:', error.message);
    }
}

/**
 * 确保 content.json 文件存在
 */
const contentFile = path.join(basePath, 'content.json');
const configPath = path.join(basePath, 'config.json');

if (!fs.existsSync(contentFile)) {
    // 创建默认配置
    const defaultContent = {
        indexTitle: '呱呱基地',
        indexDateText: '教程合集',
        indexPasswordPlaceholder: '输入密码观看',
        indexGetPasswordBtn: '获取密码'
    };
    fs.writeFileSync(contentFile, JSON.stringify(defaultContent, null, 2), FILE_ENCODING);
}

/**
 * 配置文件存储
 * 使用 multer 处理文件上传
 */
const storage = multer.diskStorage({
    // 设置文件存储目录
    destination: function(req, file, cb) {
        console.log('Upload path:', uploadPath);
        
        try {
            // 确保上传目录存在
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
                console.log('Created upload directory');
            }
            
            // 检查目录写入权限
            fs.accessSync(uploadPath, fs.constants.W_OK);
            console.log('Upload directory is writable');
            
            cb(null, uploadPath);
        } catch (error) {
            console.error('Directory error:', error);
            console.error('Error details:', error.message);
            cb(error);
        }
    },
    // 设置文件名
    filename: function(req, file, cb) {
        try {
            // 生成唯一文件名：时间戳-随机数.扩展名
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const filename = uniqueSuffix + path.extname(file.originalname);
            console.log('Generated filename:', filename);
            cb(null, filename);
        } catch (error) {
            console.error('Filename error:', error);
            cb(error);
        }
    }
});

/**
 * 配置文件上传
 * 限制文件大小和类型
 */
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 500 * 1024 * 1024,  // 限制文件大小为500MB
        files: 10                      // 限制最大文件数量
    },
    // 文件类型过滤
    fileFilter: function(req, file, cb) {
        console.log('Received file:', file.originalname, 'Type:', file.mimetype);
        
        // 只允许上传视频文件
        if (!file.mimetype.startsWith('video/')) {
            return cb(new Error('只允许上传视频文件'));
        }
        cb(null, true);
    }
}).array('video', 10);  // 多文件上传，最多10个文件，表单字段名为 'video'

/**
 * 视频数据管理
 * 使用 JSON 文件存储视频信息
 */
let videos = [];
const videosFile = path.join(basePath, 'videos.json');

// 加载已有的视频数据
if (fs.existsSync(videosFile)) {
    try {
        const data = fs.readFileSync(videosFile, FILE_ENCODING);
        const loadedVideos = JSON.parse(data);
        
        // 修改视频文件路径检查
        videos = loadedVideos.filter(video => {
            const videoPath = path.join(__dirname, video.videoUrl);
            console.log('检查视频路径:', videoPath);
            return video && 
                   video.id && 
                   video.title && 
                   video.videoUrl && 
                   fs.existsSync(videoPath.replace(/^\//, ''));
        });

        // 扫描 uploads 目录中的视频文件
        console.log('开始扫描 uploads 目录中的视频文件...');
        const uploadsDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            console.log('找到文件:', files);
            files.forEach(file => {
                if (file.toLowerCase().endsWith('.mp4')) {
                    console.log('处理视频文件:', file);
                    const existingVideo = videos.find(v => v.videoUrl === `/uploads/${file}`);
                    if (!existingVideo) {
                        console.log('添加新视频:', file);
                        // 为找到的视频文件创建记录
                        videos.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                            title: `视频 ${file}`,
                            description: '自动导入的视频',
                            category: 'beginner',
                            videoUrl: `/uploads/${file}`,
                            uploadDate: new Date().toISOString()
                        });
                    }
                }
            });
        }

        // 保存更新后的视频列表
        fs.writeFileSync(videosFile, JSON.stringify(videos, null, 2), FILE_ENCODING);
        console.log('视频数据已更新，当前共有视频：', videos.length);
    } catch (err) {
        console.error('加载视频数据失败:', err);
        videos = [];
        fs.writeFileSync(videosFile, JSON.stringify(videos, null, 2), FILE_ENCODING);
    }
} else {
    // 如果视频数据文件不存在，创建一个空的
    fs.writeFileSync(videosFile, JSON.stringify([], null, 2), FILE_ENCODING);
}

/**
 * 初始化配置文件
 */
function initConfig() {
    if (!fs.existsSync(configPath)) {
        const defaultConfig = {
            indexTitle: '呱呱基地',
            indexDateText: '教程合集',
            indexPasswordPlaceholder: '输入密码观看',
            indexGetPasswordBtn: '获取密码',
            passwordTitle: '解锁密码',
            passwordDescription: '点击"开始解锁"，观看激励广告后自动解锁密码🔓！',
            passwordNote: '(更新不易，谢谢支持！)',
            passwordUnlockBtn: '开始解锁',
            adTitle: '广告页面',
            adCompleteText: '广告观看完成，您的密码是:',
            videosTitle: '视频合集',
            videosSearchPlaceholder: '搜索视频...',
            videosCategoryBeginner: '最新',
            videosCategoryAdvanced: '往期',
            videosNoVideo: '暂无视频'
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), FILE_ENCODING);
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(configPath, FILE_ENCODING));
}

let config = initConfig();

/**
 * API 路由配置
 */
// 测试路由
app.get('/api/test', (req, res) => {
    res.json({ message: 'API 路由正常工作' });
});

// 上传视频
app.post('/api/upload', function(req, res) {
    console.log('Received upload request');
    
    upload(req, res, function(err) {
        if (err) {
            console.error('Upload error:', err);
            console.error('Error stack:', err.stack);
            console.error('Upload path:', uploadPath);
            console.error('File details:', req.files);
            return res.status(500).send('上传失败: ' + err.message);
        }

        try {
            if (!req.files || req.files.length === 0) {
                console.error('No files received in request');
                console.error('Request body:', req.body);
                return res.status(400).send('没有上传文件');
            }
            
            // 处理所有上传的文件
            const uploadedVideos = [];
            
            for (const file of req.files) {
                // 确保文件已经写入磁盘
                const fullPath = path.join(uploadPath, file.filename);
                if (!fs.existsSync(fullPath)) {
                    console.error('文件未成功写入磁盘:', fullPath);
                    continue;
                }
                
                console.log('文件已保存到磁盘:', {
                    path: fullPath,
                    size: fs.statSync(fullPath).size
                });
                
                // 确保文件路径使用正确的分隔符
                const videoUrl = `/uploads/${file.filename}`.replace(/\\/g, '/');
                
                console.log('File saved successfully:', {
                    path: file.path,
                    filename: file.filename,
                    size: file.size,
                    url: videoUrl
                });

                // 创建视频数据对象
                const videoData = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    title: req.body.title || file.filename,
                    description: req.body.description || '',
                    category: req.body.category || 'beginner',
                    videoUrl: videoUrl,
                    uploadDate: new Date().toISOString()
                };

                // 添加到视频列表
                videos.push(videoData);
                uploadedVideos.push(videoData);
            }
            
            // 保存到文件
            try {
                fs.writeFileSync(videosFile, JSON.stringify(videos, null, 2), FILE_ENCODING);
                console.log('Video data saved to file');
                res.status(200).json({
                    message: '上传成功',
                    count: uploadedVideos.length,
                    videos: uploadedVideos
                });
            } catch (err) {
                console.error('Save video data error:', err);
                return res.status(500).send('保存视频数据失败');
            }
        } catch (error) {
            console.error('Processing error:', error);
            res.status(500).send(error.message || '服务器错误');
        }
    });
});

// 获取视频列表
app.get('/api/videos', (req, res) => {
    try {
        // 确保返回正确的视频URL
        const videosWithFullUrls = videos.map(video => ({
            ...video,
            videoUrl: video.videoUrl.startsWith('/') ? video.videoUrl : '/' + video.videoUrl
        }));
        res.json(videosWithFullUrls);
    } catch (error) {
        console.error('获取视频列表失败:', error);
        res.status(500).json({ error: '获取视频列表失败' });
    }
});

// 删除视频
app.delete('/api/videos/:id', (req, res) => {
    try {
        const videoId = req.params.id;
        
        // 找到要删除的视频
        const videoIndex = videos.findIndex(v => v.id === videoId);
        if (videoIndex === -1) {
            return res.status(404).send('视频不存在');
        }

        // 获取视频文件路径
        const videoPath = path.join(uploadPath, path.basename(videos[videoIndex].videoUrl));

        // 删除视频文件
        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }

        // 从数组中删除视频数据
        videos.splice(videoIndex, 1);

        // 保存更新后的视频列表
        fs.writeFileSync(videosFile, JSON.stringify(videos, null, 2), FILE_ENCODING);

        res.status(200).send('删除成功');
    } catch (error) {
        console.error('删除视频失败:', error);
        res.status(500).send('删除失败: ' + error.message);
    }
});

// 获取内容配置
app.get('/api/content', (req, res) => {
    res.json(config);
});

// 保存内容配置
app.post('/api/content', (req, res) => {
    try {
        // 1. 保存配置到 config.json
        config = { ...config, ...req.body };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), FILE_ENCODING);

        // 2. 更新 HTML 文件内容
        const filePath = path.join(__dirname, 'password.html');
        let content = fs.readFileSync(filePath, 'utf8');

        // 更新标题标签
        if (req.body.passwordTitle) {
            content = content.replace(
                /<title>.*?<\/title>/,
                `<title>${req.body.passwordTitle}</title>`
            );
        }

        // 更新描述文字
        if (req.body.passwordDescription) {
            content = content.replace(
                /<div class="description">.*?<\/div>/,
                `<div class="description">${req.body.passwordDescription}</div>`
            );
        }

        // 更新注释文字
        if (req.body.passwordNote) {
            content = content.replace(
                /<div class="note">.*?<\/div>/,
                `<div class="note">${req.body.passwordNote}</div>`
            );
        }

        // 更新按钮文字
        if (req.body.passwordUnlockBtn) {
            content = content.replace(
                /<button class="btn"[^>]*>.*?<\/button>/,
                `<button class="btn" onclick="window.location.href='/ad.html'">${req.body.passwordUnlockBtn}</button>`
            );
        }

        // 保存更新后的文件
        fs.writeFileSync(filePath, content, 'utf8');

        res.json({ success: true });
    } catch (error) {
        console.error('保存配置失败:', error);
        res.status(500).json({ error: '保存配置失败' });
    }
});

/**
 * 静态文件服务配置
 */
// 主静态文件服务（带缓存）
app.use(express.static(path.join(basePath), {
    maxAge: '1d' // 缓存一天
}));

// Font Awesome 静态服务
app.use('/fontawesome', express.static(path.join(basePath, 'fontawesome'), {
    maxAge: '7d' // 缓存一周
}));

// 修改上传文件的静态服务配置
app.use('/uploads', express.static(uploadPath, {
    setHeaders: function(res, path) {
        res.set('Access-Control-Allow-Origin', '*');
        // 根据文件扩展名设置正确的 Content-Type
        if (path.endsWith('.mp4')) {
            res.set('Content-Type', 'video/mp4');
        }
        // 添加缓存控制头
        res.set('Cache-Control', 'public, max-age=3600');
    }
}));

// 对于视频文件的请求添加特殊日志
app.use('/uploads', (req, res, next) => {
    console.log('视频文件请求:', {
        url: req.url,
        headers: req.headers,
        fullPath: path.join(uploadPath, req.url.replace(/^\//, ''))
    });
    
    // 检查文件是否存在
    const filePath = path.join(uploadPath, req.url.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
        console.error('请求的文件不存在:', filePath);
    } else {
        console.log('文件存在，大小:', fs.statSync(filePath).size);
    }
    
    next();
});

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${decodeURIComponent(req.url)}`);
    next();
});

/**
 * 添加诊断端点
 */
app.get('/api/diagnostics', (req, res) => {
    try {
        // 检查上传目录
        const uploadExists = fs.existsSync(uploadPath);
        let uploadFiles = [];
        let uploadDirStats = null;
        
        if (uploadExists) {
            uploadFiles = fs.readdirSync(uploadPath)
                .filter(file => file.endsWith('.mp4'))
                .map(file => {
                    const filePath = path.join(uploadPath, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        size: stats.size,
                        created: stats.birthtime,
                        url: `/uploads/${file}`
                    };
                });
            
            uploadDirStats = fs.statSync(uploadPath);
        }
        
        // 检查视频数据文件
        const videosFileExists = fs.existsSync(videosFile);
        let videosData = [];
        
        if (videosFileExists) {
            videosData = JSON.parse(fs.readFileSync(videosFile, FILE_ENCODING));
        }
        
        // 返回诊断信息
        res.json({
            serverInfo: {
                platform: process.platform,
                nodeVersion: process.version,
                workingDirectory: process.cwd(),
                appDirectory: __dirname
            },
            uploadDirectory: {
                path: uploadPath,
                exists: uploadExists,
                stats: uploadDirStats ? {
                    mode: uploadDirStats.mode,
                    uid: uploadDirStats.uid,
                    gid: uploadDirStats.gid
                } : null,
                files: uploadFiles
            },
            videosFile: {
                path: videosFile,
                exists: videosFileExists,
                videoCount: videosData.length
            }
        });
    } catch (error) {
        console.error('诊断错误:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

/**
 * 添加视频扫描端点
 */
app.get('/api/scan-videos', (req, res) => {
    try {
        console.log('手动触发视频扫描...');
        const uploadsDir = path.join(__dirname, 'uploads');
        let newVideos = 0;
        
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            console.log(`找到 ${files.length} 个文件`);
            
            files.forEach(file => {
                if (file.toLowerCase().endsWith('.mp4')) {
                    console.log('处理视频文件:', file);
                    const existingVideo = videos.find(v => v.videoUrl === `/uploads/${file}`);
                    if (!existingVideo) {
                        console.log('添加新视频:', file);
                        // 为找到的视频文件创建记录
                        videos.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                            title: `视频 ${file}`,
                            description: '手动导入的视频',
                            category: 'beginner',
                            videoUrl: `/uploads/${file}`,
                            uploadDate: new Date().toISOString()
                        });
                        newVideos++;
                    }
                }
            });
            
            // 保存更新后的视频列表
            if (newVideos > 0) {
                fs.writeFileSync(videosFile, JSON.stringify(videos, null, 2), FILE_ENCODING);
                console.log(`已添加 ${newVideos} 个新视频，当前共有视频：${videos.length}`);
            }
            
            res.json({
                success: true,
                message: `扫描完成，发现 ${files.length} 个文件，添加了 ${newVideos} 个新视频`,
                totalVideos: videos.length
            });
        } else {
            res.status(404).json({
                success: false,
                message: '上传目录不存在'
            });
        }
    } catch (error) {
        console.error('扫描视频失败:', error);
        res.status(500).json({
            success: false,
            message: '扫描视频失败: ' + error.message
        });
    }
});

// 在 server.js 中添加路由处理
app.get('/', (req, res) => {
    const now = new Date();
    const dateString = `${now.getMonth() + 1}月${now.getDate()}日`;
    
    // 读取 index.html 模板
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    
    // 替换日期和标题
    html = html.replace('{{date}}', dateString);
    
    // 发送渲染后的 HTML
    res.send(html);
});

// 通用路由处理
// 确保这段代码放在特定路由处理之后
app.get('*', (req, res) => {
    res.sendFile(path.join(basePath, req.path));
});

/**
 * 错误处理中间件
 */
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    console.error('错误堆栈:', err.stack);
    console.error('请求路径:', req.path);
    console.error('请求方法:', req.method);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send('文件大小超过限制（最大500MB）');
        }
        return res.status(400).send('文件上传错误: ' + err.message);
    }
    res.status(500).send('服务器错误: ' + err.message);
});

/**
 * 添加 Windows 特定的错误处理
 */
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (err.code === 'EPERM' || err.code === 'EACCES') {
        console.error('Permission error - please check folder permissions');
    }
});

/**
 * 启动服务器
 */
function startServer(port) {
    app.listen(port, '0.0.0.0', () => {
        // 减少控制台输出
        console.log(`Server running at http://localhost:${port}`);
        
        // 检查必要目录是否存在
        [uploadPath].forEach(dir => {
            if (fs.existsSync(dir)) {
                console.log(`目录存在: ${dir}`);
                try {
                    const stats = fs.statSync(dir);
                    console.log(`目录权限: ${stats.mode}`);
                } catch (err) {
                    console.error(`无法获取目录信息: ${dir}`, err);
                }
            } else {
                console.error(`目录不存在: ${dir}`);
            }
        });
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`端口 ${port} 被占用，尝试使用 ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('服务器错误:', err);
        }
    });
}

const initialPort = process.env.PORT || 3000;
startServer(initialPort); 