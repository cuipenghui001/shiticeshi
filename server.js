const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, fileFilter: (req, file, cb) => cb(null, true) });

// ==================== DATA LAYER ====================
const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { users: [], questions: [], exams: [], results: [], practice: [], aiConfig: { apiKey: '', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-3.5-turbo' } };
    writeData(init);
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }

// Init default admin - only if no users exist
(function init() {
  const db = readData();
  if (db.users.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    db.users.push({
      id: 'admin',
      username: 'admin',
      password: bcrypt.hashSync('Admin@2024Secure', salt),
      name: '系统管理员',
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    db.users.push({
      id: genId(),
      username: 'student1',
      password: bcrypt.hashSync('Student@2024', salt),
      name: '张三',
      role: 'student',
      createdAt: new Date().toISOString()
    });
    db.users.push({
      id: genId(),
      username: 'student2',
      password: bcrypt.hashSync('Student@2024', salt),
      name: '李四',
      role: 'student',
      createdAt: new Date().toISOString()
    });
    writeData(db);
    console.log('=== 默认账号已初始化 ===');
    console.log('管理员账号: admin / Admin@2024Secure');
    console.log('学员账号: student1 / Student@2024');
    console.log('学员账号: student2 / Student@2024');
    console.log('请登录后立即修改密码！');
  }
})();

// ==================== AUTH ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readData();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });
  res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

// ==================== USERS ====================
app.get('/api/users', (req, res) => {
  const db = readData();
  res.json(db.users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt })));
});

app.post('/api/users', (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: '请填写完整信息' });
  const db = readData();
  if (db.users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
  const user = { id: genId(), username, password, name, role: 'student', createdAt: new Date().toISOString() };
  db.users.push(user);
  writeData(db);
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role, createdAt: user.createdAt });
});

app.post('/api/users/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const rows = data.slice(1).filter(r => r[0] && String(r[0]).trim());
    const db = readData();
    let added = 0, skipped = 0;
    const preview = [];
    rows.forEach(row => {
      const username = String(row[0] || '').trim();
      const password = String(row[1] || '').trim();
      const name = String(row[2] || '').trim();
      if (!username || !password) { skipped++; return; }
      if (db.users.find(u => u.username === username)) { skipped++; preview.push({ username, password, name, status: '已存在，跳过' }); return; }
      db.users.push({ id: genId(), username, password, name, role: 'student', createdAt: new Date().toISOString() });
      added++;
      preview.push({ username, password, name, status: '导入成功' });
    });
    writeData(db);
    fs.unlinkSync(req.file.path);
    res.json({ added, skipped, preview });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const db = readData();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.role === 'admin') return res.status(400).json({ error: '不能删除管理员' });
  db.users = db.users.filter(u => u.id !== req.params.id);
  db.results = db.results.filter(r => r.userId !== req.params.id);
  db.practice = db.practice.filter(p => p.userId !== req.params.id);
  writeData(db);
  res.json({ success: true });
});

// ==================== QUESTIONS ====================
app.get('/api/questions', (req, res) => {
  const db = readData();
  const { type, category, difficulty, search } = req.query;
  let result = db.questions;
  if (type) result = result.filter(q => q.type === type);
  if (category) result = result.filter(q => (q.category || '未分类') === category);
  if (difficulty) result = result.filter(q => q.difficulty === difficulty);
  if (search) result = result.filter(q => q.content.toLowerCase().includes(search.toLowerCase()));
  res.json(result);
});

app.get('/api/questions/categories', (req, res) => {
  const db = readData();
  res.json([...new Set(db.questions.map(q => q.category || '未分类'))]);
});

app.post('/api/questions/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const rows = data.slice(1).filter(r => r[0] && String(r[2] || '').trim());
    const db = readData();
    let added = 0;
    rows.forEach(row => {
      const type = String(row[1] || '').trim();
      const content = String(row[2] || '').trim();
      const options = [];
      for (let i = 3; i <= 8; i++) {
        const opt = String(row[i] || '').trim();
        if (opt) options.push(opt);
      }
      const answer = String(row[9] || '').trim();
      const score = parseFloat(row[10]) || 1;
      const category = String(row[11] || '').trim();
      const difficulty = String(row[12] || '').trim();
      const analysis = String(row[13] || '').trim();
      if (!content) return;
      db.questions.push({ id: genId(), type, content, options, answer, score, category, difficulty, analysis });
      added++;
    });
    writeData(db);
    fs.unlinkSync(req.file.path);
    res.json({ added });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/questions/:id', (req, res) => {
  const db = readData();
  db.questions = db.questions.filter(q => q.id !== req.params.id);
  writeData(db);
  res.json({ success: true });
});

app.delete('/api/questions', (req, res) => {
  const db = readData();
  db.questions = [];
  writeData(db);
  res.json({ success: true });
});

app.put('/api/questions/:id/analyze', async (req, res) => {
  const db = readData();
  const q = db.questions.find(x => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: '题目不存在' });

  const optionLabels = ['A','B','C','D','E','F'];
  const optionsText = (q.options || []).map((o, i) => `${optionLabels[i]}. ${o}`).join('\n');
  const prompt = `请对以下题目进行解析，说明解题思路和知识点：\n题型：${q.type}\n题目：${q.content}\n${q.options.length > 0 ? '选项：\n' + optionsText : ''}\n正确答案：${q.answer}\n\n请输出解析内容（200字以内），包括知识点分析和解题思路。`;

  const aiConfig = db.aiConfig || {};
  let analysis = null;

  if (aiConfig.apiKey) {
    try {
      const response = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({ model: aiConfig.model, messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.7 })
      });
      if (response.ok) {
        const result = await response.json();
        analysis = result.choices?.[0]?.message?.content?.trim();
      }
    } catch(e) { console.log('AI API error:', e.message); }
  }

  if (!analysis) {
    const keywords = extractKeywords(q.content);
    analysis = `【题型】${q.type}\n【知识点】${keywords.length > 0 ? keywords.join('、') : '待补充'}\n【难度】${q.difficulty || '中等'}\n`;
    if (q.type === '单选题') analysis += `【解题思路】本题为单选题，正确答案是 ${q.answer}。需仔细阅读每个选项，排除干扰项，选择最符合题意的答案。`;
    else if (q.type === '多选题') analysis += `【解题思路】本题为多选题，正确答案是 ${q.answer}。需逐一分析每个选项，选出所有符合题意的答案，注意不要漏选或多选。`;
    else analysis += `【解题思路】本题为判断题，正确答案是「${q.answer}」。需准确理解题目陈述内容，判断其正确性。`;
  }

  q.analysis = analysis;
  writeData(db);
  res.json({ analysis });
});

app.post('/api/questions/batch-analyze', async (req, res) => {
  const db = readData();
  const unanalyzed = db.questions.filter(q => !q.analysis);
  let count = 0;
  for (const q of unanalyzed) {
    try {
      const optionLabels = ['A','B','C','D','E','F'];
      const optionsText = (q.options || []).map((o, i) => `${optionLabels[i]}. ${o}`).join('\n');
      const prompt = `请对以下题目进行解析：\n题型：${q.type}\n题目：${q.content}\n${q.options.length > 0 ? '选项：\n' + optionsText : ''}\n正确答案：${q.answer}\n\n请输出解析内容（200字以内）。`;

      const aiConfig = db.aiConfig || {};
      let analysis = null;
      if (aiConfig.apiKey) {
        try {
          const response = await fetch(aiConfig.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
            body: JSON.stringify({ model: aiConfig.model, messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.7 })
          });
          if (response.ok) {
            const result = await response.json();
            analysis = result.choices?.[0]?.message?.content?.trim();
          }
        } catch(e) {}
      }
      if (!analysis) {
        const keywords = extractKeywords(q.content);
        analysis = `【题型】${q.type}\n【知识点】${keywords.join('、') || '待补充'}\n【难度】${q.difficulty || '中等'}`;
      }
      q.analysis = analysis;
      count++;
    } catch(e) {}
  }
  writeData(db);
  res.json({ analyzed: count });
});

function extractKeywords(text) {
  const dict = ['NR','LTE','5G','4G','基站','AMF','UE','核心网','接入网','PDCCH','PRB','MTS','NAS','RRC','切换','寻呼','注册','移动性','信令','OTN','PTN','SDH','WDM','光纤','传输网','MIMO','波束','天线','射频','RRU','BBU','AAU','5GC','EPC','UPF','SMF'];
  return dict.filter(w => text.includes(w)).slice(0, 8);
}

app.post('/api/questions/export', (req, res) => {
  const db = readData();
  const data = [['序号','题型','题目内容','选项A','选项B','选项C','选项D','选项E','选项F','答案','分值','分类','难度','解析']];
  db.questions.forEach((q, i) => {
    const row = [i+1, q.type, q.content, ...(q.options||[]), q.answer, q.score, q.category||'', q.difficulty||'', q.analysis||''];
    while (row.length < 9) row.splice(3, 0, '');
    data.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '题库');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=题库导出.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ==================== EXAMS ====================
app.get('/api/exams', (req, res) => {
  const db = readData();
  res.json(db.exams);
});

app.post('/api/exams', (req, res) => {
  const { title, questions, timeLimit, method, autoConfig } = req.body;
  const db = readData();
  let selectedQids = [];

  if (method === 'auto' && autoConfig) {
    let pool = [...db.questions];
    if (autoConfig.category) pool = pool.filter(q => (q.category || '未分类') === autoConfig.category);
    if (autoConfig.difficulty) pool = pool.filter(q => q.difficulty === autoConfig.difficulty);
    const shuffle = arr => { for (let i=arr.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };
    selectedQids = [
      ...shuffle(pool.filter(q => q.type === '单选题')).slice(0, autoConfig.singleCount || 0),
      ...shuffle(pool.filter(q => q.type === '多选题')).slice(0, autoConfig.multiCount || 0),
      ...shuffle(pool.filter(q => q.type === '判断题')).slice(0, autoConfig.judgeCount || 0),
    ].map(q => q.id);
  } else {
    selectedQids = questions || [];
  }

  if (!title || selectedQids.length === 0) return res.status(400).json({ error: '请填写试卷名称并选择题库' });
  const exam = { id: genId(), title, questions: selectedQids, timeLimit: timeLimit || 60, createdAt: new Date().toISOString() };
  db.exams.push(exam);
  writeData(db);
  res.json(exam);
});

app.delete('/api/exams/:id', (req, res) => {
  const db = readData();
  db.exams = db.exams.filter(e => e.id !== req.params.id);
  writeData(db);
  res.json({ success: true });
});

// ==================== RESULTS ====================
app.get('/api/results', (req, res) => {
  const db = readData();
  const { userId } = req.query;
  let results = db.results;
  if (userId) results = results.filter(r => r.userId === userId);
  res.json(results);
});

app.post('/api/results', (req, res) => {
  const { examId, answers } = req.body;
  const db = readData();
  const exam = db.exams.find(e => e.id === examId);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });
  let score = 0, totalScore = 0;
  exam.questions.forEach(qid => {
    const q = db.questions.find(x => x.id === qid);
    if (!q) return;
    totalScore += q.score;
    if ((answers[q.id] || '') === q.answer) score += q.score;
  });
  const result = {
    id: genId(), userId: req.body.userId, examId, answers, score, totalScore,
    completedAt: new Date().toISOString()
  };
  db.results.push(result);
  writeData(db);
  res.json(result);
});

app.post('/api/results/export', (req, res) => {
  const db = readData();
  const { userId } = req.body;
  let results = db.results;
  if (userId) results = results.filter(r => r.userId === userId);
  const data = [['学员','试卷','得分','总分','正确率','完成时间']];
  results.forEach(r => {
    const student = db.users.find(u => u.id === r.userId);
    const exam = db.exams.find(e => e.id === r.examId);
    data.push([student?.name||'未知', exam?.title||'已删除', r.score, r.totalScore, Math.round(r.score/r.totalScore*100)+'%', new Date(r.completedAt).toLocaleString()]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '成绩报表');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=成绩报表.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ==================== PRACTICE ====================
app.get('/api/practice', (req, res) => {
  const db = readData();
  const { userId } = req.query;
  let records = db.practice;
  if (userId) records = records.filter(r => r.userId === userId);
  res.json(records);
});

app.post('/api/practice', (req, res) => {
  const { userId, records } = req.body;
  const db = readData();
  records.forEach(r => {
    db.practice.push({ id: genId(), userId, questionId: r.questionId, userAnswer: r.userAnswer, isCorrect: r.isCorrect, practicedAt: new Date().toISOString() });
  });
  writeData(db);
  res.json({ success: true });
});

// ==================== CONFIG ====================
app.get('/api/config/ai', (req, res) => {
  const db = readData();
  const cfg = db.aiConfig || {};
  res.json({ endpoint: cfg.endpoint, model: cfg.model, hasKey: !!cfg.apiKey });
});

app.put('/api/config/ai', (req, res) => {
  const db = readData();
  db.aiConfig = { apiKey: req.body.apiKey || '', endpoint: req.body.endpoint || 'https://api.openai.com/v1/chat/completions', model: req.body.model || 'gpt-3.5-turbo' };
  writeData(db);
  res.json({ success: true });
});

// ==================== DATA EXPORT ====================
app.get('/api/data/export', (req, res) => {
  const db = readData();
  res.setHeader('Content-Disposition', 'attachment; filename=系统数据备份.json');
  res.setHeader('Content-Type', 'application/json');
  res.json(db);
});

// ==================== CHANGE PASSWORD ====================
app.put('/api/change-password', (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整信息' });

  const db = readData();
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(401).json({ error: '原密码错误' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码长度至少为6位' });
  }

  user.password = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
  writeData(db);
  res.json({ success: true });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`刷题系统运行在 http://localhost:${PORT}`);
  console.log(`管理员账号: admin / Admin@2024Secure`);
  console.log(`学员账号: student1 / Student@2024`);
  console.log(`学员账号: student2 / Student@2024`);
  console.log('请登录后立即修改密码！');
});
