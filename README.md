# 在线刷题系统

一个基于 Express + MySQL 的在线刷题系统，支持题目管理、考试、成绩统计等功能。

## 功能特性

- **用户管理**：支持管理员和学员账号，支持批量导入用户
- **题库管理**：支持单选题、多选题、判断题，支持批量导入导出
- **考试系统**：支持自定义试卷、自动组卷、限时考试
- **成绩统计**：实时记录考试成绩，支持导出报表
- **AI 解析**：可配置 AI API 对题目进行智能解析
- **数据备份**：支持导出全部系统数据

## 快速开始

### 环境要求

- Node.js >= 16.x
- npm >= 8.x

### 安装运行

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

默认运行在 `http://localhost:3000`

### 默认账号

- 管理员：`admin / admin123`
- 学员：`student1 / 123456` 或 `student2 / 123456`

## 部署到生产环境

### Render 部署

点击下方按钮一键部署到 Render：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### 手动部署

1. 修改 `server.js` 中的数据库配置（如需要）
2. 设置环境变量：
   - `PORT`：端口号（默认 3000）
3. 运行 `npm start`

## 项目结构

```
├── server.js          # 服务器主文件
├── index.html         # 前端页面
├── data.json          # 数据文件（自动生成）
├── uploads/           # 上传文件目录
├── package.json       # 项目配置
└── render.yaml        # Render 部署配置
```

## API 接口

详细 API 文档请参考 `server.js` 源码。

主要接口：
- `POST /api/login` - 登录
- `GET/POST /api/users` - 用户管理
- `GET/POST /api/questions` - 题目管理
- `GET/POST /api/exams` - 考试管理
- `POST /api/results` - 提交成绩
- `GET/PUT /api/config/ai` - AI 配置

## 许可证

MIT
