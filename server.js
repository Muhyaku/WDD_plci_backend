const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. KONEKSI MONGODB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ BOOM! Berhasil terhubung ke MongoDB!'))
  .catch((err) => console.error('❌ Gagal connect ke MongoDB:', err));

// 2. SCHEMA LAPORAN DARURAT
const emergencySchema = new mongoose.Schema({
  sheet: { type: String, required: true },
  message: { type: String, default: "Sistem Error / Butuh Bantuan" },
  status: { type: String, enum: ['ACTIVE', 'SOLVED'], default: 'ACTIVE' },
  timestamp: { type: String, required: true }
}, { timestamps: true });
const Emergency = mongoose.model('Emergency', emergencySchema);

// 3. SCHEMA TRANSAKSI
const transactionSchema = new mongoose.Schema({
  sheet: { type: String, required: true, index: true },
  tanggal: { type: String, required: true, index: true },
  cash: { type: Number, default: 0 },
  bca: { type: Number, default: 0 },
  gofood: { type: Number, default: 0 },
  jenisPengeluaran: { type: String, default: "" },
  totalPengeluaran: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  printCount: { type: Number, default: 0 }
}, { timestamps: true });
const Transaction = mongoose.model('Transaction', transactionSchema);

// 4. SCHEMA MENU MASTER (NAMA, HARGA, STOK)
const menuMasterSchema = new mongoose.Schema({
  sheet: { type: String, required: true, index: true },
  menuId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  lastUpdatedDate: { type: String, required: true }, // Format: YYYY-MM-DD
  lastRestockTime: { type: String, default: "" }
}, { timestamps: true });
const MenuMaster = mongoose.model('MenuMaster', menuMasterSchema);

// 5. SCHEMA ACTIVITY LOG
const activityLogSchema = new mongoose.Schema({
  sheet: { type: String, required: true, index: true },
  actionCategory: { type: String, required: true }, // 'UBAH_NAMA', 'UBAH_HARGA', 'UBAH_STOK', 'INFO_STOK'
  menuName: { type: String, required: true },
  detailAction: { type: String, required: true },
  timestamp: { type: String, required: true },
  dateString: { type: String, required: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// ==========================================
// API ACTIVITY LOG
// ==========================================
app.get('/api/activities', async (req, res) => {
  try {
    const data = await ActivityLog.find().sort({ createdAt: -1 });
    res.status(200).json(data);
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.post('/api/activities', async (req, res) => {
  try {
    const newLog = new ActivityLog(req.body);
    await newLog.save();
    res.status(201).json({ status: 'success', data: newLog });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.delete('/api/activities/bulk', async (req, res) => {
  try {
    const { ids, isHardDelete } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ status: 'error', message: 'Tidak ada data log dipilih' });

    if (isHardDelete) {
      await ActivityLog.deleteMany({ _id: { $in: ids } });
    } else {
      await ActivityLog.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true } });
    }
    res.status(200).json({ status: 'success', message: 'Log massal berhasil dihapus' });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.delete('/api/activities/hard/:id', async (req, res) => {
  try {
    await ActivityLog.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: 'success', message: 'Log dihapus permanen' });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.delete('/api/activities/:id', async (req, res) => {
  try {
    const updated = await ActivityLog.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() }, { new: true });
    res.status(200).json({ status: 'success', data: updated });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

// ==========================================
// API EMERGENCY SYSTEM (+ TELEGRAM BOT ALERT)
// ==========================================
const TELEGRAM_BOT_TOKEN = '8794940131:AAFLrlwwxwuTi6u8mU-oVQ27oINhn8L3xAc'; 
const TELEGRAM_CHAT_ID = '7971542755';

app.get('/api/emergency/active', async (req, res) => {
  try {
    const data = await Emergency.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });
    res.status(200).json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/emergency', async (req, res) => {
  try {
    const newEmergency = new Emergency(req.body);
    await newEmergency.save();

    if (TELEGRAM_BOT_TOKEN !== '8794940131:AAFLrlwwxwuTi6u8mU-oVQ27oINhn8L3xAc') {
      const pesanTelegram = `🚨 *PANGGILAN DARURAT KASIR!* 🚨\n\n📍 *Cabang:* ${req.body.sheet}\n⏰ *Waktu:* ${req.body.timestamp}\n💬 *Pesan:* ${req.body.message || 'Sistem Error / Butuh Bantuan'}\n\nSegera cek Dashboard Admin lu bos!`;
      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      
      try {
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: pesanTelegram,
            parse_mode: 'Markdown'
          })
        });
      } catch (err) {
        console.error('Gagal kirim Telegram:', err);
      }
    }

    res.status(201).json({ status: 'success', data: newEmergency });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/emergency/solve/:id', async (req, res) => {
  try {
    await Emergency.findByIdAndUpdate(req.params.id, { status: 'SOLVED' });
    res.status(200).json({ status: 'success', message: 'Masalah Selesai' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// API TRANSAKSI 
// ==========================================
app.get('/api/transactions', async (req, res) => {
  try {
    const { sheet, tanggal } = req.query;
    
    let filter = {};
    if (sheet) filter.sheet = sheet;
    if (tanggal) filter.tanggal = tanggal;

    const query = Transaction.find(filter).sort({ createdAt: 1 });
    if (tanggal) query.limit(500); 

    const data = await query.exec();
    res.status(200).json(data);
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.post('/api/transactions', async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const results = [];
      for (const item of req.body) {
        if (item.overrideDbId) {
          const { overrideDbId, ...updateData } = item;
          const updated = await Transaction.findByIdAndUpdate(overrideDbId, updateData, { new: true });
          results.push(updated);
        } else {
          const newTx = new Transaction(item);
          await newTx.save();
          results.push(newTx);
        }
      }
      return res.status(201).json({ status: 'success', data: results });
    }

    if (req.body.overrideDbId) {
      const { overrideDbId, ...updateData } = req.body;
      const updated = await Transaction.findByIdAndUpdate(overrideDbId, updateData, { new: true });
      return res.status(200).json({ status: 'success', data: updated });
    }

    const newTransaction = new Transaction(req.body);
    await newTransaction.save();
    res.status(201).json({ status: 'success', data: newTransaction });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.delete('/api/transactions/bulk', async (req, res) => {
  try {
    const { ids, isHardDelete } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ status: 'error', message: 'Tidak ada data dipilih' });

    if (isHardDelete) {
      await Transaction.deleteMany({ _id: { $in: ids } });
    } else {
      await Transaction.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: new Date() } });
    }
    res.status(200).json({ status: 'success', message: 'Data massal berhasil dihapus' });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.delete('/api/transactions/hard/:id', async (req, res) => {
  try {
    await Transaction.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: 'success', message: 'Data dihapus permanen!' });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const updatedTx = await Transaction.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() }, { new: true });
    res.status(200).json({ status: 'success', data: updatedTx });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

app.patch('/api/transactions/:id/print', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan' });
    tx.printCount += 1;
    await tx.save();
    res.status(200).json({ status: 'success', printCount: tx.printCount });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});

// ==========================================
// API MENU MASTER & STOCK MANAGEMENT
// ==========================================

// --- HELPER WAKTU ANTI-MELESET (FORCE WIB / ASIA/JAKARTA) ---
const getIndoDateString = (dateObj) => {
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long', 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric'
    }).format(dateObj);
};

const getIndoTimeString = (dateObj, withSeconds = false) => {
    const opts = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
    if (withSeconds) opts.second = '2-digit';
    return new Intl.DateTimeFormat('id-ID', opts).format(dateObj).replace(/\./g, ':');
};

const getWibTodayDate = () => {
    return new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());
};

app.get('/api/menu', async (req, res) => {
  try {
    const { sheet } = req.query;
    if (!sheet) return res.status(400).json({ error: 'Sheet diperlukan' });

    const todayDate = getWibTodayDate();
    const menus = await MenuMaster.find({ sheet });

    let updatedMenus = [];

    // LOGIKA AUTO-RESET (Lazy Evaluation)
    for (let menu of menus) {
      if (menu.lastUpdatedDate !== todayDate) {
        let detailSisa = `SISA STOK KEMARIN: Tersisa ${menu.stock} porsi`;

        await ActivityLog.create({
          sheet: menu.sheet,
          actionCategory: 'INFO_STOK',
          menuName: menu.name,
          detailAction: detailSisa,
          timestamp: '23:59:59',
          dateString: `Rekap Stok Otomatis` 
        });

        menu.stock = 0;
        menu.lastUpdatedDate = todayDate;
        await menu.save();
      }
      updatedMenus.push(menu);
    }

    res.status(200).json(updatedMenus);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// API UPDATE MENU & STOK
app.put('/api/menu', async (req, res) => {
  try {
    const { sheet, menuId, name, price, stock, currentLiveStock, isPaketan } = req.body;
    const todayDate = getWibTodayDate();
    const now = new Date();
    const timeStr = getIndoTimeString(now, true);
    const dateStr = getIndoDateString(now);

    let menu = await MenuMaster.findOne({ sheet, menuId });
    let logs = [];
    const newStockNum = parseInt(stock) || 0;
    const isPaketanItem = isPaketan || menuId.startsWith('paket-') || menuId.startsWith('pkt-');

    if (!menu) {
      menu = new MenuMaster({ sheet, menuId, name, price, stock: newStockNum, lastUpdatedDate: todayDate });
      
      if (!isPaketanItem && newStockNum > 0) {
        logs.push({
          sheet,
          actionCategory: 'UBAH_STOK',
          menuName: name,
          detailAction: `MANUAL UPDATE: Mengubah Stok dari [HABIS (0)] menjadi [${newStockNum}] porsi.`,
          timestamp: timeStr,
          dateString: dateStr
        });
        menu.lastRestockTime = timeStr;
      }
    } else {
      const oldStockNum = (currentLiveStock !== undefined && currentLiveStock !== null)
        ? parseInt(currentLiveStock) || 0
        : (menu.stock || 0);

      // 1. DETEKSI PERUBAHAN STOK (Hanya untuk non-paketan)
      if (!isPaketanItem && oldStockNum !== newStockNum) {
        const statusLama = oldStockNum === 0 ? "HABIS (0)" : oldStockNum;
        logs.push({
          sheet,
          actionCategory: 'UBAH_STOK',
          menuName: name,
          detailAction: `MANUAL UPDATE: Mengubah Stok dari [${statusLama}] menjadi [${newStockNum}] porsi.`,
          timestamp: timeStr,
          dateString: dateStr
        });
        menu.stock = newStockNum;
        menu.lastRestockTime = timeStr;
      }

      // 2. DETEKSI PERUBAHAN HARGA
      if (menu.price !== price) {
        const rupiah = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
        logs.push({ sheet, actionCategory: 'UBAH_HARGA', menuName: name, detailAction: `Ubah Harga: ${rupiah(menu.price)} -> ${rupiah(price)}`, timestamp: timeStr, dateString: dateStr });
        menu.price = price;
      }

      // 3. DETEKSI PERUBAHAN NAMA
      if (menu.name !== name) {
        logs.push({ sheet, actionCategory: 'UBAH_NAMA', menuName: name, detailAction: `Ubah Nama: [${menu.name}] -> [${name}]`, timestamp: timeStr, dateString: dateStr });
        menu.name = name;
      }

      menu.lastUpdatedDate = todayDate;
    }

    if (logs.length > 0) {
      await Promise.all([
        menu.save(),
        ActivityLog.insertMany(logs)
      ]);
    } else {
      await menu.save();
    }

    res.status(200).json({ status: 'success', data: menu });
  } catch (error) { 
    res.status(500).json({ status: 'error', message: error.message }); 
  }
});

// API KURANGI STOK SAAT CHECKOUT
app.post('/api/menu/deduct', async (req, res) => {
    try {
        const sheet = req.body.sheet || req.body.sheetName;
        const cartItems = req.body.cartItems || req.body.items || [];
        const now = new Date();
        const timeStr = getIndoTimeString(now);
        const dateStr = getIndoDateString(now);
        
        if (!sheet || !Array.isArray(cartItems)) {
            return res.status(400).json({ error: 'Payload tidak valid' });
        }
        
        const stockUpdates = cartItems.map(async (item) => {
            let baseId = item.id.split('-')[0]; 
            let menu = await MenuMaster.findOne({ sheet, menuId: baseId });
            if (!menu) return null;

            menu.stock -= item.qty;
            let logEntry = null;
            if (menu.stock <= 0) {
                menu.stock = 0;
                logEntry = { sheet, actionCategory: 'INFO_STOK', menuName: menu.name, detailAction: `STOK HABIS! ${menu.name} habis terjual pada jam ${timeStr}`, timestamp: timeStr, dateString: dateStr };
            }
            await menu.save();
            return logEntry;
        });

        const results = await Promise.all(stockUpdates);
        const logs = results.filter(log => log !== null);

        if (logs.length > 0) await ActivityLog.insertMany(logs);
        
        const emptyStockLogs = logs.map(l => `[LAPORAN SISTEM] ${l.detailAction}`);
        res.status(200).json({ status: 'success', systemMessages: emptyStockLogs });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API KEMBALIKAN STOK SAAT PESANAN DIHAPUS/DIBATALKAN KASIR
app.post('/api/menu/restore', async (req, res) => {
    try {
        const { sheet, cartItems } = req.body;
        const now = new Date();
        const timeStr = getIndoTimeString(now);
        const dateStr = getIndoDateString(now);
        
        const restoreUpdates = cartItems.map(async (item) => {
            const safeName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            let menu = await MenuMaster.findOne({ sheet, name: new RegExp(`^${safeName}$`, 'i') });
            if (!menu) return null;

            menu.stock += item.qty;
            await menu.save();
            return { sheet, actionCategory: 'INFO_STOK', menuName: menu.name, detailAction: `RESTORE STOK: ${menu.name} dikembalikan ${item.qty} porsi (Batal Pesanan)`, timestamp: timeStr, dateString: dateStr };
        });

        const logs = (await Promise.all(restoreUpdates)).filter(log => log !== null);

        if (logs.length > 0) await ActivityLog.insertMany(logs);
        res.status(200).json({ status: 'success' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 Backend nyala di http://localhost:${PORT}`));
}
module.exports = app;
