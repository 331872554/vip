const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();

// 确保 uploads 目录存在
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 确保目录存在
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        cb(null, 'uploads/')  // 文件上传目录
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// 配置静态文件服务
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 解析请求体中的数据
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 配置会话管理
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// 设置视图引擎和视图目录
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 统一使用正斜杠
function normalizePath(filepath) {
    return filepath.replace(/\\/g, '/');
}

// 路由定义
// 首页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 管理员登录页面
app.get('/admin', (req, res) => {
    res.render('admin_login');
});

// 文件上传页面
app.get('/upload', (req, res) => {
    if (req.session.authenticated) {
        res.render('upload');
    } else {
        res.redirect('/admin');
    }
});

// 处理登录请求
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'adminpassword') {
        req.session.authenticated = true;
        res.redirect('/upload');
    } else {
        res.redirect('/admin');
    }
});

// 处理文件上传请求
app.post('/upload', upload.single('video'), (req, res) => {
    try {
        if (req.file) {
            const videoData = {
                filename: req.file.filename,
                path: req.file.path,
                originalname: req.file.originalname,
                uploadDate: new Date()
            };
            
            // 确保 videos.json 存在
            if (!fs.existsSync('videos.json')) {
                fs.writeFileSync('videos.json', '[]');
            }
            
            let videos = [];
            try {
                videos = JSON.parse(fs.readFileSync('videos.json', 'utf8'));
            } catch (error) {
                videos = [];
            }
            videos.push(videoData);
            fs.writeFileSync('videos.json', JSON.stringify(videos, null, 4));
            res.redirect('/upload');
        } else {
            res.status(400).send("No file uploaded.");
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send('Error uploading file');
    }
});

// 视频列表页面
app.get('/videos', (req, res) => {
    try {
        let videos = JSON.parse(fs.readFileSync('videos.json', 'utf8'));
        // 规范化路径
        videos = videos.map(video => ({
            ...video,
            path: normalizePath(video.path)
        }));
        res.render('videos', { videos: videos });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error loading videos');
    }
});

// 处理密码验证请求
app.post('/check-password', (req, res) => {
    const userInput = req.body.password;
    if (userInput === req.session.adPassword) {
        res.redirect('/videos');
    } else {
        res.redirect('/');
    }
});

// 广告观看完成页面
app.get('/ad-watched', (req, res) => {
    const password = Math.floor(1000 + Math.random() * 9000).toString(); // 生成随机四位数密码
    req.session.adPassword = password; // 存储密码到会话
    res.send(`广告观看完成，您的密码是: ${password}`);
});

// 添加路由来处理对 /password.html 的请求
app.get('/password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'password.html'));
});

// 添加路由来处理对 /ad.html 的请求
app.get('/ad.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'ad.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});