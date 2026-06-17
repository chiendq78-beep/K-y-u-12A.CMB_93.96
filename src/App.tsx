import React, { useState, useEffect, useRef } from "react";
import { 
  GraduationCap, 
  Search, 
  PlusCircle, 
  RotateCcw, 
  Heart, 
  MessageSquare, 
  Sparkles, 
  User, 
  Camera, 
  SlidersHorizontal, 
  Image as ImageIcon, 
  Check, 
  Trash2, 
  X,
  ExternalLink,
  BookOpen,
  HelpCircle,
  Clock,
  Video,
  Film,
  Users,
  Calendar,
  Lock,
  Unlock,
  Edit3,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  Folder,
  Upload,
  Database,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DEFAULT_CLASSMATES, GROUPS } from "./data";
import { Classmate, CollectiveAlbum } from "./types";
import { CommentsSection } from "./components/CommentsSection";
import { YearbookFlipbook } from "./components/YearbookFlipbook";
import confetti from "canvas-confetti";
import JSZip from "jszip";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, databaseId } from "./firebase";

// Reusable image compression function using HTML5 Canvas to keep images small/sharp and prevent Firestore 1MB document size limits
const compressImage = (file: File, maxWidth = 1800, maxHeight = 1800, quality = 0.95): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Bổ sung logic upscaling nhẹ nếu ảnh đầu vào quá nhỏ để giữ độ chi tiết cao
        const minDim = 800;
        if (width < minDim && height < minDim) {
          const scaleFactor = Math.min(minDim / width, minDim / height, 1.5);
          width = Math.round(width * scaleFactor);
          height = Math.round(height * scaleFactor);
        }

        // Đảm bảo tỷ lệ khung hình
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Bật chế độ làm mịn ảnh chất lượng cao để tránh hiện tượng gãy ảnh, vỡ nét răng cưa
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Thực hiện kỹ thuật giảm kích thước nhiều bước (step-down/mipmapping) để ảnh mượt mà, giữ rõ nét chi tiết khuôn mặt
        let srcWidth = img.width;
        let srcHeight = img.height;

        if (srcWidth > width * 2 || srcHeight > height * 2) {
          let stepCanvas = document.createElement("canvas");
          stepCanvas.width = srcWidth;
          stepCanvas.height = srcHeight;
          let stepCtx = stepCanvas.getContext("2d");
          if (stepCtx) {
            stepCtx.drawImage(img, 0, 0);
            
            while (srcWidth > width * 2 || srcHeight > height * 2) {
              const nextWidth = Math.round(srcWidth / 2);
              const nextHeight = Math.round(srcHeight / 2);
              if (nextWidth < width || nextHeight < height) break;
              
              const tempCanvas = document.createElement("canvas");
              tempCanvas.width = nextWidth;
              tempCanvas.height = nextHeight;
              const tempCtx = tempCanvas.getContext("2d");
              if (tempCtx) {
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = "high";
                tempCtx.drawImage(stepCanvas, 0, 0, srcWidth, srcHeight, 0, 0, nextWidth, nextHeight);
                stepCanvas = tempCanvas;
                stepCtx = tempCtx;
                srcWidth = nextWidth;
                srcHeight = nextHeight;
              } else {
                break;
              }
            }
            ctx.drawImage(stepCanvas, 0, 0, srcWidth, srcHeight, 0, 0, width, height);
          } else {
            ctx.drawImage(img, 0, 0, width, height);
          }
        } else {
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Áp dụng bộ lọc làm sắc nét (unsharp mask / convolution filter) để khuôn mặt và mắt cực kỳ trong, rõ nét
        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          const outputData = new Uint8ClampedArray(data.length);
          const w = width;
          const h = height;
          
          // Sao chép ban đầu
          for (let i = 0; i < data.length; i++) {
            outputData[i] = data[i];
          }
          
          // Kernel sắc nét nhẹ nhàng, giúp lấy lại chi tiết nhỏ
          const weights = [
             0, -0.10,  0,
            -0.10, 1.40, -0.10,
             0, -0.10,  0
          ];
          const side = 3;
          const halfSide = 1;

          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const sy = y;
              const sx = x;
              const dstOff = (y * w + x) * 4;
              let r = 0, g = 0, b = 0;
              for (let cy = 0; cy < side; cy++) {
                for (let cx = 0; cx < side; cx++) {
                  const scy = sy + cy - halfSide;
                  const scx = sx + cx - halfSide;
                  const srcOff = (scy * w + scx) * 4;
                  const wt = weights[cy * side + cx];
                  r += data[srcOff] * wt;
                  g += data[srcOff + 1] * wt;
                  b += data[srcOff + 2] * wt;
                }
              }
              outputData[dstOff] = Math.min(255, Math.max(0, r));
              outputData[dstOff + 1] = Math.min(255, Math.max(0, g));
              outputData[dstOff + 2] = Math.min(255, Math.max(0, b));
              outputData[dstOff + 3] = data[dstOff + 3];
            }
          }
          ctx.putImageData(new ImageData(outputData, w, h), 0, 0);
        } catch (e) {
          console.warn("Sharpening filter skipped (CORS/secure context):", e);
        }

        // Tối ưu hóa chuỗi Base64 để cận mức 1MB của Firestore
        let currentQuality = Math.max(quality, 0.95);
        let compressedBase64 = canvas.toDataURL("image/jpeg", currentQuality);
        
        while (compressedBase64.length > 920000 && currentQuality > 0.4) {
          currentQuality -= 0.05;
          compressedBase64 = canvas.toDataURL("image/jpeg", currentQuality);
        }
        
        if (compressedBase64.length > 920000) {
          let currentScale = 0.85;
          while (compressedBase64.length > 920000 && currentScale > 0.3) {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = Math.round(width * currentScale);
            tempCanvas.height = Math.round(height * currentScale);
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
              tempCtx.imageSmoothingEnabled = true;
              tempCtx.imageSmoothingQuality = "high";
              tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
              compressedBase64 = tempCanvas.toDataURL("image/jpeg", 0.90);
              let tempQual = 0.90;
              while (compressedBase64.length > 920000 && tempQual > 0.5) {
                tempQual -= 0.05;
                compressedBase64 = tempCanvas.toDataURL("image/jpeg", tempQual);
              }
            }
            currentScale -= 0.15;
          }
        }

        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const vietnameseToIsoDate = (str: string): string => {
  if (!str) return "";
  const trimmed = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const day = parts[0].trim().padStart(2, "0");
    const month = parts[1].trim().padStart(2, "0");
    const year = parts[2].trim();
    if (day.length === 2 && month.length === 2 && year.length === 4) {
      const dNum = parseInt(day, 10);
      const mNum = parseInt(month, 10);
      const yNum = parseInt(year, 10);
      if (dNum >= 1 && dNum <= 31 && mNum >= 1 && mNum <= 12 && yNum >= 1900) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  return "";
};

const isoToVietnameseDate = (str: string): string => {
  if (!str) return "";
  const parts = str.trim().split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
};


// Safe wrapper around localStorage setItem to catch any QuotaExceededError or security restrictions
class IndexedDBStorage {
  private dbName = "ky-yeu-sqlite-replica";
  private storeName = "kv-store";
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async getItem<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise<T | null>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("IndexedDB getItem error:", e);
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("IndexedDB setItem error:", e);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("IndexedDB removeItem error:", e);
    }
  }
}

const idbStorage = new IndexedDBStorage();
const dbReplicaMemoryStore: Record<string, string> = {};

const getLocalData = (key: string): string | null => {
  if (dbReplicaMemoryStore[key] !== undefined) {
    return dbReplicaMemoryStore[key];
  }
  return localStorage.getItem(key);
};

const safeSaveToLocalStorage = (key: string, data: any) => {
  const jsonStr = JSON.stringify(data);
  dbReplicaMemoryStore[key] = jsonStr;

  // Async replication to unlimited IndexedDB storage
  idbStorage.setItem(key, data).catch((err) => {
    console.warn(`IndexedDB save failed for ${key}:`, err);
  });

  // Attempt sync replication to standard localStorage
  try {
    localStorage.setItem(key, jsonStr);
  } catch (error) {
    console.warn(`localStorage exceeded storage limit for [${key}], fallbacked successfully to Unlimited IndexedDB:`, error);
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};

const DEFAULT_ALBUMS = [
  { id: "alb-1", name: "🏫 Lớp học thân quen", description: "Kỷ niệm góc sân trường và phòng học mái ngói thân thương." },
  { id: "alb-2", name: "⚽ Ngoại khóa & Dã ngoại", description: "Các chuyến đi phượt, giao lưu bóng đá và văn nghệ lớp." },
  { id: "alb-3", name: "🤪 Hậu trường tinh nghịch", description: "Những khoảnh khắc dìm hàng nhắng nhít khó quên." }
];

const DEFAULT_COLL_PHOTOS = [
  {
    id: "col-1",
    title: "Tập Thể Lớp Dưới Sân Trường Cổ Kính (1995)",
    description: "Tấm ảnh chụp chung trước thềm kỳ thi tốt nghiệp niên khóa 93-96. Tà áo trắng bay dạt dào dưới tán bàng xanh.",
    url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=1200",
    date: "Tháng 05, 1995",
    albumId: "alb-1"
  },
  {
    id: "col-2",
    title: "Chuyến Dã Ngoại Cọp Sơn Tây (1994)",
    description: "Bữa trưa hối hả ăn xôi cuộn, ngã lăn ra bãi cỏ chọc ghẹo nhau đến khản tiếng dưới ánh nắng đầu thu mát rượi.",
    url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&q=80&w=1200",
    date: "Mùa thu, 1994",
    albumId: "alb-2"
  },
  {
    id: "col-3",
    title: "Ngày Hội Giao Lưu Bóng Đá 12A.CMB (1996)",
    description: "Hò hét khản cả cổ bên lề sân bóng đất đỏ. Hôm ấy lớp mình vắng vài bạn, nhưng tiếng hô vang thì rộn rã tuyệt vời.",
    url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=1200",
    date: "Tháng 03, 1996",
    albumId: "alb-2"
  }
];

const DEFAULT_MEM_PHOTOS = [
  {
    id: "mem-1",
    title: "Cuốn Sổ Sứ Điệp & Lưu Bút",
    description: "Dòng mực tím nắn nót, nét chữ thanh nét đậm, trao nhau lời hứa sẽ mãi nhớ về một thuở áo trắng mộc mơ.",
    url: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=600"
  },
  {
    id: "mem-2",
    title: "Băng Cassette Nhạc Trịnh & Thơ Ca học trò",
    description: "Những chiều mất điện cả đám túm tụm quanh chiếc cassette chạy pin, nghe bản tình ca bất hủ dắt ta tìm lại những ngày thơ bé.",
    url: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&q=80&w=600"
  },
  {
    id: "mem-3",
    title: "Giấy Khen Học Kỳ & Hoa Phượng Khô",
    description: "Những cánh phượng hồng rực rỡ, ép cẩn thận phẳng phiu ở trang vở địa lý học trò, nay đã úa màu nhưng kỷ niệm vẫn vẹn nguyên.",
    url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=600"
  },
  {
    id: "mem-4",
    title: "Dàn Xe Đạp Phượng Hoàng Sân Trường",
    description: "Dưới bóng xà cừ rợp lá, tiếng đùm xe chạm đều đinh đang ngân vang mỗi chiều tan học gió thổi tóc bay bồng bềnh.",
    url: "https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&q=80&w=600"
  }
];

const DEFAULT_MEM_VIDEOS = [
  {
    id: "vid-1",
    title: "Thanh Xuân Lớp Học 12A.CMB (Giai điệu Mong Ước Kỷ Niệm Xưa)",
    description: "Dòng cảm xúc chứa chan thời áo trắng bay lượn, những bóng bàng, cánh phượng đỏ hồng, hành lang đầy gió năm xưa.",
    url: "https://www.youtube.com/embed/zWeREb-pLrs"
  },
  {
    id: "vid-2",
    title: "Phim Tư Liệu Bế Giảng Phượng Vĩ Ngày Ấy (VHS Rip)",
    description: "Thước phim màu mờ thô cũ ghi lại khoảng khắc rưng rưng ghi lưu bút lên lưng áo bạn học thân quý ngày bế giảng 1996.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ"
  }
];

const DEFAULT_GUESTBOOK = [
  {
    id: "gb-1",
    sender: "Đào Duy Anh",
    title: "Gửi tập thể 12A thân thương!",
    content: "Thời gian trôi nhanh quá các bạn ơi, mới chớp mắt một cái mà đã vèo 30 năm rồi. Mình vẫn nhớ mãi những trưa nắng đạp xe vòng quanh sân trường cũ, cùng chia nhau ổ bánh mì kẹp hay nắn nót viết từng dòng lưu bút trên vạt áo trắng ngày bế giảng năm 1996. Mong rằng dù ở bất cứ nơi đâu, các bạn của tớ vẫn luôn giữ mãi nụ cười trong trẻo hồn nhiên của tuổi 18!",
    date: "Ngày 15 tháng 06, 2026",
    bgStyle: "yellow",
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: "gb-2",
    sender: "Hoàng Thùy Linh",
    title: "Lời nhắn gửi từ cô bạn bàn cuối bàn 4",
    content: "Chào cả lớp mình! Lướt nhìn những tấm ảnh chụp chung ngày xưa mà tim mình cứ bồi hồi rưng rưng khôn tả. Nhớ bạn lớp trưởng gương mẫu hay nhắc nhở lớp giữ trật tự, nhớ cả nhóm tinh nghịch trùm quậy hay bẻ phượng rào trường, trốn học đi xem bóng đá... Khoảng thời gian niên khóa 1993 - 1996 ấy thực sự là mảnh ký ức rực rỡ và trân quý nhất đời tớ. Chúc cả lớp mình mãi gắn bó bên nhau nồng ấm!",
    date: "Ngày 16 tháng 06, 2026",
    bgStyle: "pink",
    createdAt: new Date().toISOString()
  }
];

export default function App() {
  // Admin Login State
  const [isAdmin, setIsAdmin] = useState<boolean>(() => localStorage.getItem("ky-yeu-is-admin") === "true");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Persistence with Firestore (starts with defaults to avoid flash, then updates via observers)
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStorageReady, setIsStorageReady] = useState(false);

  // Main navigation tabs state: 'portrait' | 'collective' | 'memories' | 'guestbook' | 'video'
  const [activeMainTab, setActiveMainTab] = useState<"portrait" | "collective" | "memories" | "guestbook" | "video">("portrait");

  // Guestbook (Lưu bút) States
  const [guestbookEntries, setGuestbookEntries] = useState<any[]>([]);
  const [isGuestbookFormOpen, setIsGuestbookFormOpen] = useState(false);
  const [editingGuestbookId, setEditingGuestbookId] = useState<string | null>(null);
  const [newGuestbookSender, setNewGuestbookSender] = useState("");
  const [newGuestbookTitle, setNewGuestbookTitle] = useState("");
  const [newGuestbookContent, setNewGuestbookContent] = useState("");
  const [newGuestbookDate, setNewGuestbookDate] = useState("");
  const [newGuestbookBgStyle, setNewGuestbookBgStyle] = useState<string>("yellow");
  const [guestbookDateMode, setGuestbookDateMode] = useState<"calendar" | "custom">("calendar");

  // Album States
  const [collectiveAlbums, setCollectiveAlbums] = useState<CollectiveAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>("all");
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "book">("book");
  const [isAlbumFormOpen, setIsAlbumFormOpen] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");
  const [newColAlbumId, setNewColAlbumId] = useState<string>("");

  // ZIP Download progress state
  const [zipProgress, setZipProgress] = useState<{
    status: "idle" | "preparing" | "downloading" | "compressing" | "done" | "error";
    total: number;
    current: number;
    message?: string;
  }>({ status: "idle", total: 0, current: 0 });

  // Media states for collective photos, memories, and videos
  const [collectivePhotos, setCollectivePhotos] = useState<{ id: string; title: string; description: string; url: string; date?: string }[]>([]);

  const [memoryPhotos, setMemoryPhotos] = useState<{ id: string; title: string; description: string; url: string }[]>([]);

  const [memoryVideos, setMemoryVideos] = useState<{ id: string; title: string; description: string; url: string }[]>([]);

  // Dual-mode Storage State: Google Cloud Firestore vs Local Browser Storage
  const [dbMode, setDbMode] = useState<"cloud" | "local">(() => {
    const saved = localStorage.getItem("ky-yeu-db-mode");
    if (saved === "local") return "local";
    return "cloud";
  });
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Warm up memory cache from IndexedDB offline storage on mount
  useEffect(() => {
    const warmupIndexedDB = async () => {
      try {
        const dbSuffix = databaseId || "default";
        const keys = [
          `local-db-classmates-${dbSuffix}`,
          `local-db-collectiveAlbums-${dbSuffix}`,
          `local-db-collectivePhotos-${dbSuffix}`,
          `local-db-memoryPhotos-${dbSuffix}`,
          `local-db-memoryVideos-${dbSuffix}`,
          `local-db-guestbook-${dbSuffix}`
        ];
        for (const key of keys) {
          const stored = await idbStorage.getItem<any>(key);
          if (stored !== null) {
            dbReplicaMemoryStore[key] = JSON.stringify(stored);
          }
        }
      } catch (e) {
        console.warn("Warmup IndexedDB cache failed:", e);
      } finally {
        setIsStorageReady(true);
      }
    };
    warmupIndexedDB();
  }, []);

  const loadAllLocalData = () => {
    const dbSuffix = databaseId || "default";
    const localClassmates = getLocalData(`local-db-classmates-${dbSuffix}`);
    const localAlbums = getLocalData(`local-db-collectiveAlbums-${dbSuffix}`);
    const localColPhotos = getLocalData(`local-db-collectivePhotos-${dbSuffix}`);
    const localMemPhotos = getLocalData(`local-db-memoryPhotos-${dbSuffix}`);
    const localMemVideos = getLocalData(`local-db-memoryVideos-${dbSuffix}`);
    const localGuestbook = getLocalData(`local-db-guestbook-${dbSuffix}`);

    if (!localClassmates) {
      safeSaveToLocalStorage(`local-db-classmates-${dbSuffix}`, DEFAULT_CLASSMATES);
      setClassmates(DEFAULT_CLASSMATES);
    } else {
      setClassmates(JSON.parse(localClassmates));
    }

    if (!localAlbums) {
      safeSaveToLocalStorage(`local-db-collectiveAlbums-${dbSuffix}`, DEFAULT_ALBUMS);
      setCollectiveAlbums(DEFAULT_ALBUMS);
    } else {
      setCollectiveAlbums(JSON.parse(localAlbums));
    }

    if (!localColPhotos) {
      safeSaveToLocalStorage(`local-db-collectivePhotos-${dbSuffix}`, DEFAULT_COLL_PHOTOS);
      setCollectivePhotos(DEFAULT_COLL_PHOTOS);
    } else {
      setCollectivePhotos(JSON.parse(localColPhotos));
    }

    if (!localMemPhotos) {
      safeSaveToLocalStorage(`local-db-memoryPhotos-${dbSuffix}`, DEFAULT_MEM_PHOTOS);
      setMemoryPhotos(DEFAULT_MEM_PHOTOS);
    } else {
      setMemoryPhotos(JSON.parse(localMemPhotos));
    }

    if (!localMemVideos) {
      safeSaveToLocalStorage(`local-db-memoryVideos-${dbSuffix}`, DEFAULT_MEM_VIDEOS);
      setMemoryVideos(DEFAULT_MEM_VIDEOS);
    } else {
      setMemoryVideos(JSON.parse(localMemVideos));
    }

    if (!localGuestbook) {
      safeSaveToLocalStorage(`local-db-guestbook-${dbSuffix}`, DEFAULT_GUESTBOOK);
      setGuestbookEntries(DEFAULT_GUESTBOOK);
    } else {
      const parsed = JSON.parse(localGuestbook);
      parsed.sort((a: any, b: any) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
      setGuestbookEntries(parsed);
    }
  };

  const saveItem = async (collectionName: string, id: string, itemData: any) => {
    const dbSuffix = databaseId || "default";
    const localKey = `local-db-${collectionName}-${dbSuffix}`;
    const rawLocal = getLocalData(localKey);
    let list = rawLocal ? JSON.parse(rawLocal) : [];
    
    const index = list.findIndex((x: any) => x.id === id);
    if (index >= 0) {
      list[index] = { ...list[index], ...itemData, id };
    } else {
      list.push({ ...itemData, id });
    }
    safeSaveToLocalStorage(localKey, list);

    if (dbMode === "local") {
      if (collectionName === "classmates") {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        setClassmates(sorted);
      } else if (collectionName === "collectiveAlbums") {
        setCollectiveAlbums(list);
      } else if (collectionName === "collectivePhotos") {
        setCollectivePhotos(list);
      } else if (collectionName === "memoryPhotos") {
        setMemoryPhotos(list);
      } else if (collectionName === "memoryVideos") {
        setMemoryVideos(list);
      } else if (collectionName === "guestbook") {
        const sorted = [...list].sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
        setGuestbookEntries(sorted);
      }
      return;
    }

    try {
      await setDoc(doc(db, collectionName, id), itemData, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${id}`);
      if (err instanceof Error && (err.message.includes("quota") || err.message.includes("Quota") || err.message.includes("resource-exhausted") || err.message.includes("LIMIT_EXCEEDED") || err.message.includes("exceeded"))) {
        setIsQuotaExceeded(true);
        setDbMode("local");
        localStorage.setItem("ky-yeu-db-mode", "local");
        loadAllLocalData();
      } else {
        throw err;
      }
    }
  };

  const deleteItem = async (collectionName: string, id: string) => {
    const dbSuffix = databaseId || "default";
    const localKey = `local-db-${collectionName}-${dbSuffix}`;
    const rawLocal = getLocalData(localKey);
    let list = rawLocal ? JSON.parse(rawLocal) : [];
    list = list.filter((x: any) => x.id !== id);
    safeSaveToLocalStorage(localKey, list);

    if (dbMode === "local") {
      if (collectionName === "classmates") {
        setClassmates(list);
      } else if (collectionName === "collectiveAlbums") {
        setCollectiveAlbums(list);
      } else if (collectionName === "collectivePhotos") {
        setCollectivePhotos(list);
      } else if (collectionName === "memoryPhotos") {
        setMemoryPhotos(list);
      } else if (collectionName === "memoryVideos") {
        setMemoryVideos(list);
      } else if (collectionName === "guestbook") {
        setGuestbookEntries(list);
      }
      return;
    }

    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
      if (err instanceof Error && (err.message.includes("quota") || err.message.includes("Quota") || err.message.includes("resource-exhausted") || err.message.includes("LIMIT_EXCEEDED") || err.message.includes("exceeded"))) {
        setIsQuotaExceeded(true);
        setDbMode("local");
        localStorage.setItem("ky-yeu-db-mode", "local");
        loadAllLocalData();
      } else {
        throw err;
      }
    }
  };

  // Seeding helper to initialize Firestore when database is completely empty
  const seedDatabase = async () => {
    try {
      const classmatesCol = collection(db, "classmates");
      const classmatesSnap = await getDocs(classmatesCol);
      if (classmatesSnap.empty) {
        for (const classmate of DEFAULT_CLASSMATES) {
          await setDoc(doc(db, "classmates", classmate.id), classmate);
        }
      }

      const albumCol = collection(db, "collectiveAlbums");
      const albumSnap = await getDocs(albumCol);
      if (albumSnap.empty) {
        for (const alb of DEFAULT_ALBUMS) {
          await setDoc(doc(db, "collectiveAlbums", alb.id), alb);
        }
      }

      const colCol = collection(db, "collectivePhotos");
      const colSnap = await getDocs(colCol);
      if (colSnap.empty) {
        for (const item of DEFAULT_COLL_PHOTOS) {
          await setDoc(doc(db, "collectivePhotos", item.id), item);
        }
      }

      const memCol = collection(db, "memoryPhotos");
      const memSnap = await getDocs(memCol);
      if (memSnap.empty) {
        for (const item of DEFAULT_MEM_PHOTOS) {
          await setDoc(doc(db, "memoryPhotos", item.id), item);
        }
      }

      const vidCol = collection(db, "memoryVideos");
      const vidSnap = await getDocs(vidCol);
      if (vidSnap.empty) {
        for (const item of DEFAULT_MEM_VIDEOS) {
          await setDoc(doc(db, "memoryVideos", item.id), item);
        }
      }

      const guestbookCol = collection(db, "guestbook");
      const guestbookSnap = await getDocs(guestbookCol);
      if (guestbookSnap.empty) {
        for (const item of DEFAULT_GUESTBOOK) {
          await setDoc(doc(db, "guestbook", item.id), item);
        }
      }
    } catch (error) {
      console.error("Lỗi khởi tạo dữ liệu mẫu:", error);
      throw error;
    }
  };

  // Sync with Firestore using real-time observers
  useEffect(() => {
    if (!isStorageReady) return;
    let active = true;

    if (dbMode === "local") {
      loadAllLocalData();
      setIsLoading(false);
      return;
    }

    let unsubClassmates: (() => void) | null = null;
    let unsubCol: (() => void) | null = null;
    let unsubMem: (() => void) | null = null;
    let unsubVid: (() => void) | null = null;
    let unsubAlbums: (() => void) | null = null;
    let unsubGuestbook: (() => void) | null = null;
    let safetyTimeout: any = null;

    const handleQuotaError = (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("quota") || msg.includes("Quota") || msg.includes("resource-exhausted") || msg.includes("LIMIT_EXCEEDED") || msg.includes("exceeded")) {
        setIsQuotaExceeded(true);
        setDbMode("local");
        localStorage.setItem("ky-yeu-db-mode", "local");
      }
    };

    const initDataAndListen = async () => {
      // Direct optimization check: if database has already been seeded on this client, do NOT block on sequential checks!
      const dbSuffix = databaseId || "default";
      const seedKey = `ky-yeu-db-seeded-${dbSuffix}`;
      const isSeeded = localStorage.getItem(seedKey) === "true";
      if (!isSeeded) {
        try {
          await seedDatabase();
          localStorage.setItem(seedKey, "true");
        } catch (err) {
          handleQuotaError(err);
        }
      }
      if (!active) return;

      let classmatesLoaded = false;
      let colLoaded = false;
      let memLoaded = false;
      let vidLoaded = false;
      let albumsLoaded = false;
      let guestbookLoaded = false;

      const checkAllLoaded = () => {
        if (classmatesLoaded && colLoaded && memLoaded && vidLoaded && albumsLoaded && guestbookLoaded) {
          setIsLoading(false);
          if (safetyTimeout) {
            clearTimeout(safetyTimeout);
          }
        }
      };

      // Set up a safety loading release after 3.5s maximum to avoid freezing on slow connections
      safetyTimeout = setTimeout(() => {
        if (active) {
          setIsLoading(false);
        }
      }, 3500);

      const dbSuffix2 = databaseId || "default";

      unsubClassmates = onSnapshot(collection(db, "classmates"), (snapshot) => {
        if (!active) return;
        const list: Classmate[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Classmate);
        });
        
        if (list.length > 0) {
          list.sort((a, b) => a.name.localeCompare(b.name));
          setClassmates(list);
          safeSaveToLocalStorage(`local-db-classmates-${dbSuffix2}`, list);
        } else {
          // If Firestore is empty/reset, load local or default fallback so screen doesn't clear!
          const local = getLocalData(`local-db-classmates-${dbSuffix2}`);
          if (local) {
            setClassmates(JSON.parse(local));
          } else {
            setClassmates(DEFAULT_CLASSMATES);
          }
        }

        classmatesLoaded = true;
        checkAllLoaded();
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "classmates");
        handleQuotaError(error);
        
        // Local fallback on error
        const local = getLocalData(`local-db-classmates-${dbSuffix2}`);
        if (local) {
          setClassmates(JSON.parse(local));
        } else {
          setClassmates(DEFAULT_CLASSMATES);
        }

        classmatesLoaded = true;
        checkAllLoaded();
      });

      unsubCol = onSnapshot(collection(db, "collectivePhotos"), (snapshot) => {
        if (!active) return;
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        
        if (list.length > 0) {
          setCollectivePhotos(list);
          safeSaveToLocalStorage(`local-db-collectivePhotos-${dbSuffix2}`, list);
        } else {
          const local = getLocalData(`local-db-collectivePhotos-${dbSuffix2}`);
          if (local) {
            setCollectivePhotos(JSON.parse(local));
          } else {
            setCollectivePhotos(DEFAULT_COLL_PHOTOS);
          }
        }

        colLoaded = true;
        checkAllLoaded();
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "collectivePhotos");
        handleQuotaError(error);

        const local = getLocalData(`local-db-collectivePhotos-${dbSuffix2}`);
        if (local) {
          setCollectivePhotos(JSON.parse(local));
        } else {
          setCollectivePhotos(DEFAULT_COLL_PHOTOS);
        }

        colLoaded = true;
        checkAllLoaded();
      });

      unsubMem = onSnapshot(collection(db, "memoryPhotos"), (snapshot) => {
        if (!active) return;
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        
        if (list.length > 0) {
          setMemoryPhotos(list);
          safeSaveToLocalStorage(`local-db-memoryPhotos-${dbSuffix2}`, list);
        } else {
          const local = getLocalData(`local-db-memoryPhotos-${dbSuffix2}`);
          if (local) {
            setMemoryPhotos(JSON.parse(local));
          } else {
            setMemoryPhotos(DEFAULT_MEM_PHOTOS);
          }
        }

        memLoaded = true;
        checkAllLoaded();
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "memoryPhotos");
        handleQuotaError(error);

        const local = getLocalData(`local-db-memoryPhotos-${dbSuffix2}`);
        if (local) {
          setMemoryPhotos(JSON.parse(local));
        } else {
          setMemoryPhotos(DEFAULT_MEM_PHOTOS);
        }

        memLoaded = true;
        checkAllLoaded();
      });

      unsubVid = onSnapshot(collection(db, "memoryVideos"), (snapshot) => {
        if (!active) return;
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        
        if (list.length > 0) {
          setMemoryVideos(list);
          safeSaveToLocalStorage(`local-db-memoryVideos-${dbSuffix2}`, list);
        } else {
          const local = getLocalData(`local-db-memoryVideos-${dbSuffix2}`);
          if (local) {
            setMemoryVideos(JSON.parse(local));
          } else {
            setMemoryVideos(DEFAULT_MEM_VIDEOS);
          }
        }

        vidLoaded = true;
        checkAllLoaded();
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "memoryVideos");
        handleQuotaError(error);

        const local = getLocalData(`local-db-memoryVideos-${dbSuffix2}`);
        if (local) {
          setMemoryVideos(JSON.parse(local));
        } else {
          setMemoryVideos(DEFAULT_MEM_VIDEOS);
        }

        vidLoaded = true;
        checkAllLoaded();
      });

      unsubAlbums = onSnapshot(collection(db, "collectiveAlbums"), (snapshot) => {
        if (!active) return;
        const list: CollectiveAlbum[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as CollectiveAlbum);
        });
        
        if (list.length > 0) {
          setCollectiveAlbums(list);
          safeSaveToLocalStorage(`local-db-collectiveAlbums-${dbSuffix2}`, list);
        } else {
          const local = getLocalData(`local-db-collectiveAlbums-${dbSuffix2}`);
          if (local) {
            setCollectiveAlbums(JSON.parse(local));
          } else {
            setCollectiveAlbums(DEFAULT_ALBUMS);
          }
        }

        albumsLoaded = true;
        checkAllLoaded();
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "collectiveAlbums");
        handleQuotaError(error);

        const local = getLocalData(`local-db-collectiveAlbums-${dbSuffix2}`);
        if (local) {
          setCollectiveAlbums(JSON.parse(local));
        } else {
          setCollectiveAlbums(DEFAULT_ALBUMS);
        }

        albumsLoaded = true;
        checkAllLoaded();
      });

      unsubGuestbook = onSnapshot(collection(db, "guestbook"), (snapshot) => {
        if (!active) return;
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        
        if (list.length > 0) {
          // Sort guestbook entries: newest first
          list.sort((a, b) => {
            const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tB - tA;
          });
          setGuestbookEntries(list);
          safeSaveToLocalStorage(`local-db-guestbook-${dbSuffix2}`, list);
        } else {
          const local = getLocalData(`local-db-guestbook-${dbSuffix2}`);
          if (local) {
            const parsed = JSON.parse(local);
            parsed.sort((a: any, b: any) => {
              const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return tB - tA;
            });
            setGuestbookEntries(parsed);
          } else {
            setGuestbookEntries(DEFAULT_GUESTBOOK);
          }
        }

        guestbookLoaded = true;
        checkAllLoaded();
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "guestbook");
        handleQuotaError(error);

        const local = getLocalData(`local-db-guestbook-${dbSuffix2}`);
        if (local) {
          const parsed = JSON.parse(local);
          parsed.sort((a: any, b: any) => {
            const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tB - tA;
          });
          setGuestbookEntries(parsed);
        } else {
          setGuestbookEntries(DEFAULT_GUESTBOOK);
        }

        guestbookLoaded = true;
        checkAllLoaded();
      });
    };

    initDataAndListen();

    return () => {
      active = false;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (unsubClassmates) unsubClassmates();
      if (unsubCol) unsubCol();
      if (unsubMem) unsubMem();
      if (unsubVid) unsubVid();
      if (unsubAlbums) unsubAlbums();
      if (unsubGuestbook) unsubGuestbook();
    };
  }, [dbMode, isStorageReady]);

  // States
  const [searchQuery, setSearchQuery] = useState("");
  const [vintageFilter, setVintageFilter] = useState<"normal" | "sepia" | "bw" | "warm" | "cool" | "grainy">("normal");
  const [selectedGroup, setSelectedGroup] = useState("Tất Cả");
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [selectedClassmate, setSelectedClassmate] = useState<Classmate | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string>("vid-1");

  // Editing element trackers
  const [editingClassmateId, setEditingClassmateId] = useState<string | null>(null);
  const [editingColPhotoId, setEditingColPhotoId] = useState<string | null>(null);
  const [editingMemPhotoId, setEditingMemPhotoId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  // Lightbox view state
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; title: string; description?: string } | null>(null);

  // Custom Confirm Dialog state
  const [confirmTarget, setConfirmTarget] = useState<{
    type: "classmate" | "collective" | "memory" | "video" | "restore" | "guestbook" | "album";
    id?: string;
    title: string;
    message: string;
  } | null>(null);

  // Zoomed classmate view state (Fullscreen photo & profile flip)
  const [zoomedClassmate, setZoomedClassmate] = useState<{ student: Classmate; index: number } | null>(null);
  const [isZoomedFlipped, setIsZoomedFlipped] = useState(false);

  // Close and reset classmate Form
  const handleCloseClassmateForm = () => {
    setIsAddFormOpen(false);
    setEditingClassmateId(null);
    setNewName("");
    setNewNickname("");
    setNewRole("");
    setNewGroup("Tổ 1");
    setNewQuote("");
    setNewFunnyChat("");
    setCustomUrl("");
    setUploadedBase64("");
  };

  // Close and reset collective photo Form
  const handleCloseColForm = () => {
    setIsColFormOpen(false);
    setEditingColPhotoId(null);
    setNewColTitle("");
    setNewColDesc("");
    setNewColUrl("");
    setNewColUpload("");
    setNewColDate("");
    setNewColAlbumId("");
    setDirectUploadAlbumId(null);
    setColDateMode("calendar");
  };

  // Helper to load image via canvas fallback if raw fetch fails under CORS blocks
  const fetchImageViaCanvasFallback = (url: string): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (url.startsWith("data:")) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              resolve(blob);
            }, "image/jpeg", 0.9);
          } else {
            resolve(null);
          }
        } catch (err) {
          console.error("Canvas toBlob error:", err);
          resolve(null);
        }
      };
      img.onerror = () => {
        resolve(null);
      };
    });
  };

  // Main function to download all files in an album as ZIP
  const handleDownloadAllPhotos = async (albumId: string) => {
    const album = collectiveAlbums.find(a => a.id === albumId);
    const albumName = album ? album.name : "Album Ky Niem";
    const photosToDownload = collectivePhotos.filter(photo => photo.albumId === albumId);
    
    if (photosToDownload.length === 0) {
      alert("Album này hiện tại chưa có ảnh nào để tải về.");
      return;
    }

    setZipProgress({ 
      status: "preparing", 
      total: photosToDownload.length, 
      current: 0, 
      message: `Đang chuẩn bị tải về ${photosToDownload.length} ảnh...` 
    });

    const zip = new JSZip();
    const failedUrls: { title: string; url: string }[] = [];

    for (let i = 0; i < photosToDownload.length; i++) {
      const photo = photosToDownload[i];
      setZipProgress({
        status: "downloading",
        total: photosToDownload.length,
        current: i + 1,
        message: `Đang tải ảnh ${i + 1}/${photosToDownload.length}: ${photo.title || "Không tiêu đề"}`
      });

      const safeTitle = (photo.title || `photo_${photo.id}`)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Tone marks
        .replace(/[đĐ]/g, "d")
        .replace(/[^a-zA-Z0-9_\-\s]/g, "")
        .replace(/\s+/g, "_")
        .trim() || `photo_${photo.id}`;

      try {
        let blobData: Blob | null = null;
        if (photo.url.startsWith("data:")) {
          // Parse data URI directly
          const response = await fetch(photo.url);
          blobData = await response.blob();
        } else {
          // Try standard fetch first
          try {
            const res = await fetch(photo.url);
            if (res.ok) {
              blobData = await res.blob();
            }
          } catch (fetchErr) {
            console.warn(`Fetch image failed, trying canvas fallback for: ${photo.url}`, fetchErr);
          }

          // If standard fetch failed, try canvas fallback
          if (!blobData) {
            blobData = await fetchImageViaCanvasFallback(photo.url);
          }
        }

        if (blobData) {
          let ext = "jpg";
          if (blobData.type) {
            const parts = blobData.type.split("/");
            if (parts.length > 1) {
              ext = parts[1] === "jpeg" ? "jpg" : parts[1];
            }
          }
          zip.file(`${safeTitle || "anh_ky_niem"}.${ext}`, blobData);
        } else {
          failedUrls.push({ title: photo.title, url: photo.url });
        }
      } catch (err) {
        console.error(`Error processing image ${photo.title}:`, err);
        failedUrls.push({ title: photo.title, url: photo.url });
      }
    }

    // Write failed links list to zip
    if (failedUrls.length > 0) {
      let docContent = "DANH SACH DUONG DAN ANH KHONG THE TAI TU DONG\r\n";
      docContent += "==============================================================\r\n";
      docContent += "He thong khong the tai trực tiếp các ảnh này ve file nen vi ly do bao mật CORS.\r\n";
      docContent += "Ban hay copy cac link duoi day vao tinh duyet de tai thu cong nhe:\r\n\r\n";
      failedUrls.forEach((f, idx) => {
        docContent += `${idx + 1}. ${f.title}\r\n📍 Link: ${f.url}\r\n\r\n`;
      });
      zip.file("HUONG_DAN_TAI_ANH_CORS.txt", docContent);
    }

    setZipProgress({
      status: "compressing",
      total: photosToDownload.length,
      current: photosToDownload.length,
      message: "Đang nén các tệp ảnh thành tệp ZIP..."
    });

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      const safeAlbumName = albumName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .replace(/[^a-zA-Z0-9_\-\s]/g, "")
        .replace(/\s+/g, "_")
        .trim() || `Album_${albumId}`;
      link.download = `${safeAlbumName}_Ky_Niem.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setZipProgress({
        status: "done",
        total: photosToDownload.length,
        current: photosToDownload.length,
        message: failedUrls.length > 0 
          ? `Tải về xong! Có ${photosToDownload.length - failedUrls.length} ảnh được tải về, còn lại ${failedUrls.length} đường dẫn tải thủ công được lưu trong file TXT.`
          : `Đã nén và tải về toàn bộ ${photosToDownload.length} ảnh thành công!`
      });

      setTimeout(() => {
        setZipProgress({ status: "idle", total: 0, current: 0 });
      }, 4000);
    } catch (zipErr) {
      console.error("Error generating zip:", zipErr);
      setZipProgress({
        status: "error",
        total: photosToDownload.length,
        current: 0,
        message: "Lỗi trong quá trình khởi tạo và nén file ZIP."
      });
    }
  };

  // Submit new Album / Update existing
  const handleAddAlbumSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) {
      alert("Vui lòng điền tên album nhé!");
      return;
    }
    const albumId = editingAlbumId || "alb-" + Date.now().toString();
    try {
      if (editingAlbumId) {
        await saveItem("collectiveAlbums", albumId, {
          id: albumId,
          name: newAlbumName.trim(),
          description: newAlbumDesc.trim(),
        });
      } else {
        await saveItem("collectiveAlbums", albumId, {
          id: albumId,
          name: newAlbumName.trim(),
          description: newAlbumDesc.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      setIsAlbumFormOpen(false);
      setEditingAlbumId(null);
      setNewAlbumName("");
      setNewAlbumDesc("");
      triggerVintageConfetti();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `collectiveAlbums/${albumId}`);
    }
  };

  // Close and reset memory photo Form
  const handleCloseMemForm = () => {
    setIsMemFormOpen(false);
    setEditingMemPhotoId(null);
    setNewMemTitle("");
    setNewMemDesc("");
    setNewMemUrl("");
    setNewMemUpload("");
  };

  // Close and reset video Form
  const handleCloseVidForm = () => {
    setIsVidFormOpen(false);
    setEditingVideoId(null);
    setNewVidTitle("");
    setNewVidDesc("");
    setNewVidUrl("");
  };

  // Close and reset Guestbook form
  const handleCloseGuestbookForm = () => {
    setIsGuestbookFormOpen(false);
    setEditingGuestbookId(null);
    setNewGuestbookSender("");
    setNewGuestbookTitle("");
    setNewGuestbookContent("");
    setNewGuestbookDate("");
    setNewGuestbookBgStyle("yellow");
    setGuestbookDateMode("calendar");
  };

  // Submit new Guestbook Entry / Update existing
  const handleAddGuestbookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestbookSender.trim() || !newGuestbookTitle.trim() || !newGuestbookContent.trim()) {
      alert("Vui lòng điền đầy đủ Tên, Tiêu đề và Lời nhắn nhé!");
      return;
    }
    const entryId = editingGuestbookId || "gb-" + Date.now().toString();
    try {
      if (editingGuestbookId) {
        await saveItem("guestbook", entryId, {
          id: entryId,
          sender: newGuestbookSender.trim(),
          title: newGuestbookTitle.trim(),
          content: newGuestbookContent.trim(),
          date: newGuestbookDate.trim() || new Date().toLocaleDateString("vi-VN"),
          bgStyle: newGuestbookBgStyle,
        });
      } else {
        await saveItem("guestbook", entryId, {
          id: entryId,
          sender: newGuestbookSender.trim(),
          title: newGuestbookTitle.trim(),
          content: newGuestbookContent.trim(),
          date: newGuestbookDate.trim() || new Date().toLocaleDateString("vi-VN"),
          bgStyle: newGuestbookBgStyle,
          createdAt: new Date().toISOString(),
        });
      }
      handleCloseGuestbookForm();
      triggerVintageConfetti();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `guestbook/${entryId}`);
    }
  };

  // Populate guestbook for editing
  const handleEditGuestbook = (entry: any) => {
    setEditingGuestbookId(entry.id);
    setNewGuestbookSender(entry.sender);
    setNewGuestbookTitle(entry.title);
    setNewGuestbookContent(entry.content);
    const origDate = entry.date || "";
    setNewGuestbookDate(origDate);
    
    // Automatically determine appropriate mode based on loaded date
    if (origDate) {
      const iso = vietnameseToIsoDate(origDate);
      if (iso) {
        setGuestbookDateMode("calendar");
      } else {
        setGuestbookDateMode("custom");
      }
    } else {
      setGuestbookDateMode("calendar");
    }

    setNewGuestbookBgStyle(entry.bgStyle || "yellow");
    setIsGuestbookFormOpen(true);
  };

  // Delete guestbook entry
  const handleDeleteGuestbook = (id: string) => {
    const target = guestbookEntries.find(g => g.id === id);
    setConfirmTarget({
      type: "guestbook",
      id,
      title: "Xóa Lời Lưu Bút",
      message: `Bạn có chắc chắn muốn xóa trang lưu bút "${target ? target.title : 'này'}" của bạn học ${target ? target.sender : ''} không? Hành động này không thể hoàn tác.`
    });
  };

  // Populate edit classmate form
  const handleEditClassmate = (student: Classmate, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid card flip on click
    setEditingClassmateId(student.id);
    setNewName(student.name);
    setNewNickname(student.nickname || "");
    setNewRole(student.role);
    setNewGroup(student.group);
    setNewQuote(student.quote);
    setNewFunnyChat(student.funnyChat || "");
    if (student.avatarUrl.startsWith("data:")) {
      setImageUrlOption("upload");
      setUploadedBase64(student.avatarUrl);
    } else {
      setImageUrlOption("url");
      setCustomUrl(student.avatarUrl);
    }
    setIsAddFormOpen(true);
  };

  // Populate edit collective photo form
  const handleEditColPhoto = (photo: { id: string; title: string; description: string; url: string; date?: string; albumId?: string }) => {
    setEditingColPhotoId(photo.id);
    setNewColTitle(photo.title);
    setNewColDesc(photo.description);
    const origDate = photo.date || "";
    setNewColDate(origDate);
    
    // Automatically determine appropriate mode based on loaded date
    if (origDate) {
      const iso = vietnameseToIsoDate(origDate);
      if (iso) {
        setColDateMode("calendar");
      } else {
        setColDateMode("custom");
      }
    } else {
      setColDateMode("calendar");
    }

    setNewColAlbumId(photo.albumId || "");
    if (photo.url.startsWith("data:")) {
      setNewColUrlChoice("upload");
      setNewColUpload(photo.url);
    } else {
      setNewColUrlChoice("url");
      setNewColUrl(photo.url);
    }
    setIsColFormOpen(true);
  };

  // Populate edit memory photo form
  const handleEditMemPhoto = (item: { id: string; title: string; description: string; url: string }) => {
    setEditingMemPhotoId(item.id);
    setNewMemTitle(item.title);
    setNewMemDesc(item.description);
    if (item.url.startsWith("data:")) {
      setNewMemUrlChoice("upload");
      setNewMemUpload(item.url);
    } else {
      setNewMemUrlChoice("url");
      setNewMemUrl(item.url);
    }
    setIsMemFormOpen(true);
  };

  // Populate edit video form
  const handleEditVideo = (item: { id: string; title: string; description: string; url: string }) => {
    setEditingVideoId(item.id);
    setNewVidTitle(item.title);
    setNewVidDesc(item.description);
    setNewVidUrl(item.url);
    setIsVidFormOpen(true);
  };

  // Collective Form State
  const [isColFormOpen, setIsColFormOpen] = useState(false);
  const [directUploadAlbumId, setDirectUploadAlbumId] = useState<string | null>(null);
  const [newColTitle, setNewColTitle] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [newColUrlChoice, setNewColUrlChoice] = useState("upload"); // 'preset' or 'upload' or 'url'
  const [newColPreset, setNewColPreset] = useState("https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=1200");
  const [newColUrl, setNewColUrl] = useState("");
  const [newColUpload, setNewColUpload] = useState("");
  const [newColDate, setNewColDate] = useState("");
  const [colDateMode, setColDateMode] = useState<"calendar" | "custom">("calendar");

  const uploadColRef = useRef<HTMLInputElement>(null);

  // Memories Form State
  const [isMemFormOpen, setIsMemFormOpen] = useState(false);
  const [newMemTitle, setNewMemTitle] = useState("");
  const [newMemDesc, setNewMemDesc] = useState("");
  const [newMemUrlChoice, setNewMemUrlChoice] = useState("preset"); // 'preset' or 'upload' or 'url'
  const [newMemPreset, setNewMemPreset] = useState("https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=600");
  const [newMemUrl, setNewMemUrl] = useState("");
  const [newMemUpload, setNewMemUpload] = useState("");

  const uploadMemRef = useRef<HTMLInputElement>(null);

  // Video Form State
  const [isVidFormOpen, setIsVidFormOpen] = useState(false);
  const [newVidTitle, setNewVidTitle] = useState("");
  const [newVidDesc, setNewVidDesc] = useState("");
  const [newVidUrl, setNewVidUrl] = useState("");



  // Presets
  const PRESET_COLLECTIVES = [
    { name: "Cùng Thầy Cô Giáo", url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=1200" },
    { name: "Hội Trại Buổi Tối", url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&q=80&w=1200" },
    { name: "Thầy Trò Trò Chuyện", url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=1200" },
    { name: "Dưới Hiên Lớp Cổ", url: "https://images.unsplash.com/photo-1525921429624-479b6c29454f?auto=format&fit=crop&q=80&w=1200" },
    { name: "Sân Trường Nắng Vàng", url: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=1200" },
  ];

  const PRESET_MEMORIES = [
    { name: "Lưu bút thời hoa đỏ", url: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=600" },
    { name: "Cassette nhạc Trịnh", url: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&q=80&w=600" },
    { name: "Cánh phượng ép sách", url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=600" },
    { name: "Xe đạp Phượng Hoàng", url: "https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&q=80&w=600" },
    { name: "Bàn học đen xước quen thuộc", url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=600" },
  ];

  // Helper to parse YouTube URLs cleanly
  const getEmbedUrl = (url: string) => {
    if (!url) return "";
    let videoId = "";
    try {
      if (url.includes("youtube.com/watch")) {
        const urlParams = new URLSearchParams(new URL(url).search);
        videoId = urlParams.get("v") || "";
      } else if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1]?.split("?")[0] || "";
      } else if (url.includes("youtube.com/embed/")) {
        return url;
      }
    } catch (err) {
      console.warn("Lỗi phân tích URL video:", err);
    }
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
  };

  // Form student details
  const [newName, setNewName] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newGroup, setNewGroup] = useState("Tổ 1");
  const [newQuote, setNewQuote] = useState("");
  const [newFunnyChat, setNewFunnyChat] = useState("");
  const [imageUrlOption, setImageUrlOption] = useState("upload"); // 'preset' or 'url' or 'upload'
  const [presetImage, setPresetImage] = useState("https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600");
  const [customUrl, setCustomUrl] = useState("");
  const [uploadedBase64, setUploadedBase64] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fun preset graduation photos to choose from
  const PRESET_PORTRAITS = [
    { name: "Nữ tú thanh tao", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600" },
    { name: "Nam sinh lịch lãm", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600" },
    { name: "Cười duyên rạng rỡ", url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=600" },
    { name: "Kính cận thông thái", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=600" },
    { name: "Góc nghiêng sâu lắng", url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600" },
    { name: "Nụ cười tỏa nắng", url: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=600" },
  ];

  // Trigger vintage color palette confetti
  const triggerVintageConfetti = () => {
    const activeThemes = ["#5A5A40", "#C8DBC8", "#ECD9D9", "#E5E0C0", "#405A40", "#6E4B4B", "#D6E2ED"];
    
    // Left burst
    confetti({
      particleCount: 30,
      angle: 60,
      spread: 65,
      origin: { x: 0.05, y: 0.85 },
      colors: activeThemes,
    });
    
    // Right burst
    confetti({
      particleCount: 30,
      angle: 120,
      spread: 65,
      origin: { x: 0.95, y: 0.85 },
      colors: activeThemes,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("ky-yeu-is-admin");
    setIsAdmin(false);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === "admin" || adminPassword === "12a" || adminPassword.toLowerCase() === "12aadmin") {
      setIsAdmin(true);
      localStorage.setItem("ky-yeu-is-admin", "true");
      setIsLoginModalOpen(false);
      setAdminPassword("");
      setLoginError("");
      triggerVintageConfetti();
    } else {
      setLoginError("Mật khẩu không chính xác. Thử lại nhé! (Gợi ý: admin hoặc 12a)");
    }
  };

  // Flip card handler
  const handleCardClick = (id: string) => {
    const isNowFlipped = !flippedCards[id];
    setFlippedCards((prev) => ({
      ...prev,
      [id]: isNowFlipped,
    }));

    if (isNowFlipped) {
      triggerVintageConfetti();
    }
  };

  // Flip all cards to front
  const handleFlipAllFront = () => {
    setFlippedCards({});
  };

  // Flip all cards to back
  const handleFlipAllBack = () => {
    const allBack: Record<string, boolean> = {};
    classmates.forEach((c) => {
      allBack[c.id] = true;
    });
    setFlippedCards(allBack);
    triggerVintageConfetti();
    setTimeout(() => {
      triggerVintageConfetti();
    }, 250);
  };

  // Restore defaults
  const handleRestoreDefaults = () => {
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    setConfirmTarget({
      type: "restore",
      title: "Khôi Phục Mặc Định",
      message: "Bạn có chắc chắn muốn khôi phục danh sách kỷ yếu về mặc định ban đầu không? Toàn bộ dữ liệu tự thêm sẽ bị ghi đè."
    });
  };

  // Delete classmate
  const handleDeleteClassmate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering card flip
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    const target = classmates.find((item) => item.id === id);
    setConfirmTarget({
      type: "classmate",
      id,
      title: "Xóa Thẻ Chân Dung",
      message: `Bạn có chắc muốn xóa thẻ kỷ niệm của học sinh ${target ? `"${target.name}"` : "này"} khỏi ứng dụng không?`
    });
  };

  // Download classmate photo to device
  const handleDownloadPhoto = async (url: string, name: string) => {
    try {
      if (!url) return;
      
      const fileName = `ky-yeu-${name.toLowerCase().replace(/\s+/g, '-')}.png`;

      // If it's a data URI (uploaded base64 string)
      if (url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Try fetching the image as blob to bypass CORS/download limitations
      try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        // Fallback: direct download link if CORS blocked
        const link = document.createElement('a');
        link.href = url;
        link.target = "_blank";
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error("Failed to download image:", error);
      // Ultimate fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  // Image upload handler to Base64 with automatic canvas-based JPEG compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert("Hình ảnh quá lớn! Vui lòng chọn file dưới 15MB.");
        return;
      }
      try {
        // High quality sharp compression for portrait avatar (1000x1000, quality 0.88)
        const compressed = await compressImage(file, 1000, 1000, 0.88);
        setUploadedBase64(compressed);
      } catch (err) {
        console.error("Lỗi tự động nén ảnh chân dung:", err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setUploadedBase64(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Add new classmate submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!newName.trim() || !newRole.trim() || !newQuote.trim()) {
      alert("Vui lòng điền đầy đủ các thông tin bắt buộc: Họ tên, Vai trò và Tâm sự nhé!");
      return;
    }

    let finalAvatarUrl = "";
    if (imageUrlOption === "preset") {
      finalAvatarUrl = presetImage;
    } else if (imageUrlOption === "url") {
      finalAvatarUrl = customUrl.trim() || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600";
    } else {
      finalAvatarUrl = uploadedBase64 || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600";
    }

    const classmateId = editingClassmateId || Date.now().toString();
    const classmateDoc: Classmate = {
      id: classmateId,
      name: newName.trim(),
      ...(newNickname.trim() ? { nickname: newNickname.trim() } : {}),
      role: newRole.trim(),
      group: newGroup,
      avatarUrl: finalAvatarUrl,
      quote: newQuote.trim(),
      ...(newFunnyChat.trim() ? { funnyChat: newFunnyChat.trim() } : {})
    };

    try {
      await saveItem("classmates", classmateId, classmateDoc);
      handleCloseClassmateForm();
      triggerVintageConfetti();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `classmates/${classmateId}`);
    }
  };

  // Media uploaders with auto-compression
  const handleColFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert("Hình ảnh quá lớn! Vui lòng chọn file dưới 15MB.");
        return;
      }
      try {
        // High resolution limit for collective photos (3200x3200, quality 0.95) to preserve small facial details perfectly
        const compressed = await compressImage(file, 3200, 3200, 0.95);
        setNewColUpload(compressed);
      } catch (err) {
        console.error("Lỗi tự động nén ảnh tập thể lớp:", err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewColUpload(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleMemFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert("Hình ảnh quá lớn! Vui lòng chọn file dưới 15MB.");
        return;
      }
      try {
        // High quality scale for memories/artifacts (2400x2400, quality 0.95)
        const compressed = await compressImage(file, 2400, 2400, 0.95);
        setNewMemUpload(compressed);
      } catch (err) {
        console.error("Lỗi tự động nén ảnh hiện vật kỉ niệm:", err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewMemUpload(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Submit collective photo
  const handleAddColSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!newColTitle.trim() || !newColDesc.trim()) {
      alert("Vui lòng điền đầy đủ Tiêu đề và Mô tả ảnh nhé!");
      return;
    }

    let finalUrl = "";
    if (newColUrlChoice === "preset") {
      finalUrl = newColPreset;
    } else if (newColUrlChoice === "url") {
      finalUrl = newColUrl.trim() || "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=1200";
    } else {
      finalUrl = newColUpload || "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=1200";
    }

    const colId = editingColPhotoId || "col-" + Date.now().toString();
    const item = {
      id: colId,
      title: newColTitle.trim(),
      description: newColDesc.trim(),
      url: finalUrl,
      ...(newColDate.trim() ? { date: newColDate.trim() } : {}),
      ...(newColAlbumId.trim() ? { albumId: newColAlbumId.trim() } : {})
    };

    try {
      await saveItem("collectivePhotos", colId, item);
      handleCloseColForm();
      triggerVintageConfetti();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `collectivePhotos/${colId}`);
    }
  };

  // Submit memory photo
  const handleAddMemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!newMemTitle.trim() || !newMemDesc.trim()) {
      alert("Vui lòng điền Tiêu đề và Mô tả kỉ niệm!");
      return;
    }

    let finalUrl = "";
    if (newMemUrlChoice === "preset") {
      finalUrl = newMemPreset;
    } else if (newMemUrlChoice === "url") {
      finalUrl = newMemUrl.trim() || "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=600";
    } else {
      finalUrl = newMemUpload || "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=600";
    }

    const memId = editingMemPhotoId || "mem-" + Date.now().toString();
    const item = {
      id: memId,
      title: newMemTitle.trim(),
      description: newMemDesc.trim(),
      url: finalUrl
    };

    try {
      await saveItem("memoryPhotos", memId, item);
      handleCloseMemForm();
      triggerVintageConfetti();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `memoryPhotos/${memId}`);
    }
  };

  // Submit video
  const handleAddVidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!newVidTitle.trim() || !newVidUrl.trim() || !newVidDesc.trim()) {
      alert("Vui lòng điền đầy đủ Tiêu đề, Mô tả và Đường dẫn xem video!");
      return;
    }

    const vidId = editingVideoId || "vid-" + Date.now().toString();
    const item = {
      id: vidId,
      title: newVidTitle.trim(),
      description: newVidDesc.trim(),
      url: newVidUrl.trim()
    };

    try {
      await saveItem("memoryVideos", vidId, item);
      handleCloseVidForm();
      triggerVintageConfetti();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `memoryVideos/${vidId}`);
    }
  };

  // Delete handlers
  const handleDeleteCol = (id: string) => {
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    const target = collectivePhotos.find((item) => item.id === id);
    setConfirmTarget({
      type: "collective",
      id,
      title: "Xóa Ảnh Tập Thể",
      message: `Bạn có chắc chắn muốn xóa ảnh tập thể ${target ? `"${target.title}"` : "này"} khỏi lưu trữ không?`
    });
  };

  const handleDeleteMem = (id: string) => {
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    const target = memoryPhotos.find((item) => item.id === id);
    setConfirmTarget({
      type: "memory",
      id,
      title: "Xóa Ảnh Kỷ Niệm Hiện Vật",
      message: `Bạn có chắc chắn muốn xóa ảnh kỷ vật ${target ? `"${target.title}"` : "này"} khỏi danh mục không?`
    });
  };

  const handleDeleteVid = (id: string) => {
    if (!isAdmin) {
      setIsLoginModalOpen(true);
      return;
    }
    const target = memoryVideos.find((item) => item.id === id);
    setConfirmTarget({
      type: "video",
      id,
      title: "Xóa Thước Phim Kỷ Niệm",
      message: `Bạn có chắc chắn muốn xóa thước phim hoặc video ${target ? `"${target.title}"` : "này"} không?`
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    const { type, id } = confirmTarget;

    try {
      if (type === "restore") {
        if (dbMode === "local") {
          const dbSuffix = databaseId || "default";
          safeSaveToLocalStorage(`local-db-classmates-${dbSuffix}`, DEFAULT_CLASSMATES);
          setClassmates(DEFAULT_CLASSMATES);
        } else {
          // Reset to original default classmates: clear classmates and seed again
          const classmatesCol = collection(db, "classmates");
          const classmatesSnap = await getDocs(classmatesCol);
          for (const docSnap of classmatesSnap.docs) {
            await deleteDoc(doc(db, "classmates", docSnap.id));
          }
          for (const classmate of DEFAULT_CLASSMATES) {
            await setDoc(doc(db, "classmates", classmate.id), classmate);
          }
        }
        setFlippedCards({});
      } else if (type === "classmate" && id) {
        await deleteItem("classmates", id);
        setFlippedCards((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else if (type === "collective" && id) {
        await deleteItem("collectivePhotos", id);
      } else if (type === "memory" && id) {
        await deleteItem("memoryPhotos", id);
      } else if (type === "video" && id) {
        await deleteItem("memoryVideos", id);
      } else if (type === "guestbook" && id) {
        await deleteItem("guestbook", id);
      } else if (type === "album" && id) {
        const affected = collectivePhotos.filter(p => p.albumId === id);
        for (const p of affected) {
          const updated = { ...p };
          delete updated.albumId;
          // Clean up undefined properties to avoid Firebase setDoc errors
          Object.keys(updated).forEach(key => {
            if ((updated as any)[key] === undefined) {
              delete (updated as any)[key];
            }
          });
          await saveItem("collectivePhotos", p.id, updated);
        }
        await deleteItem("collectiveAlbums", id);
        setSelectedAlbumId("all");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${type}/${id || ''}`);
    }

    setConfirmTarget(null);
    triggerVintageConfetti();
  };

  // Export backup of current loaded memory data
  const handleExportBackup = () => {
    try {
      const backupData = {
        databaseId: databaseId || "default",
        exportDate: new Date().toISOString(),
        classmates,
        collectiveAlbums,
        collectivePhotos,
        memoryPhotos,
        memoryVideos,
        guestbook: guestbookEntries
      };
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ky-yeu-12A-sao-luu-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert("Đã tải tệp chứa bản sao lưu thành công!");
    } catch (err) {
      console.error("Lỗi khi tạo bản sao lưu:", err);
      alert("Có lỗi xảy ra khi tạo bản sao lưu. Vui lòng thử lại!");
    }
  };

  // Import backup data from JSON file
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.classmates && !data.guestbook && !data.collectivePhotos) {
        alert("Định dạng file sao lưu không hợp lệ hoặc không có dữ liệu!");
        return;
      }

      const confirmImport = confirm(
        "Bạn có chắc chắn muốn nhập dữ liệu này không? Hành động này sẽ thay thế dữ liệu hiện tại ngay lập tức."
      );
      if (!confirmImport) return;

      const dbSuffix = databaseId || "default";

      // Save each to local storage
      if (data.classmates) {
        safeSaveToLocalStorage(`local-db-classmates-${dbSuffix}`, data.classmates);
        setClassmates(data.classmates);
      }
      if (data.collectiveAlbums) {
        safeSaveToLocalStorage(`local-db-collectiveAlbums-${dbSuffix}`, data.collectiveAlbums);
        setCollectiveAlbums(data.collectiveAlbums);
      }
      if (data.collectivePhotos) {
        safeSaveToLocalStorage(`local-db-collectivePhotos-${dbSuffix}`, data.collectivePhotos);
        setCollectivePhotos(data.collectivePhotos);
      }
      if (data.memoryPhotos) {
        safeSaveToLocalStorage(`local-db-memoryPhotos-${dbSuffix}`, data.memoryPhotos);
        setMemoryPhotos(data.memoryPhotos);
      }
      if (data.memoryVideos) {
        safeSaveToLocalStorage(`local-db-memoryVideos-${dbSuffix}`, data.memoryVideos);
        setMemoryVideos(data.memoryVideos);
      }
      if (data.guestbook) {
        safeSaveToLocalStorage(`local-db-guestbook-${dbSuffix}`, data.guestbook);
        setGuestbookEntries(data.guestbook);
      }

      // If in cloud mode, attempt write-through, but catch quota gracefully
      if (dbMode === "cloud") {
        try {
          alert("Dữ liệu đã được lưu cục bộ cực kỳ an toàn! Đang cố gắng đẩy đồng bộ lên máy chủ đám mây...");
          
          if (data.classmates) {
            for (const x of data.classmates) {
              await setDoc(doc(db, "classmates", x.id), x);
            }
          }
          if (data.collectiveAlbums) {
            for (const x of data.collectiveAlbums) {
              await setDoc(doc(db, "collectiveAlbums", x.id), x);
            }
          }
          if (data.collectivePhotos) {
            for (const x of data.collectivePhotos) {
              await setDoc(doc(db, "collectivePhotos", x.id), x);
            }
          }
          if (data.memoryPhotos) {
            for (const x of data.memoryPhotos) {
              await setDoc(doc(db, "memoryPhotos", x.id), x);
            }
          }
          if (data.memoryVideos) {
            for (const x of data.memoryVideos) {
              await setDoc(doc(db, "memoryVideos", x.id), x);
            }
          }
          if (data.guestbook) {
            for (const x of data.guestbook) {
              await setDoc(doc(db, "guestbook", x.id), x);
            }
          }
          
          alert("Đồng bộ thành công dữ liệu khôi phục lên đám mây!");
        } catch (cloudErr) {
          console.warn("Lỗi đồng bộ đám mây (có thể do hết hạn ngạch):", cloudErr);
          setIsQuotaExceeded(true);
          setDbMode("local");
          localStorage.setItem("ky-yeu-db-mode", "local");
          alert("Lưu ý: Do hết hạn ngạch máy chủ đám mây nên hệ thống đã tự động chuyển sang chế độ Ngoại tuyến. Toàn bộ dữ liệu bạn nhập đã khôi phục đầy đủ và lưu tại Trình duyệt này!");
        }
      } else {
        alert("Khôi phục bản sao lưu tại thiết bị thành công!");
      }

      setIsBackupModalOpen(false);
      triggerVintageConfetti();
    } catch (err) {
      console.error("Lỗi khi nhập bản sao lưu:", err);
      alert("Đọc tệp sao lưu thất bại. Vui lòng kiểm tra định dạng file!");
    }
  };

  // Filter & Search Logic
  const filteredClassmates = classmates.filter((item) => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.nickname && item.nickname.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.quote.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedGroup === "Tất Cả") {
      return matchesSearch;
    }
    return matchesSearch && item.group === selectedGroup;
  });

  // Handle Escape key to close the zoomed classmate modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!zoomedClassmate) return;
      if (e.key === "Escape") {
        setZoomedClassmate(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomedClassmate]);

  // Class Slogans for the Running Marquee Title
  const marqueeSlogans = [
    "🎓 CHÀO MỪNG ĐẾN VỚI SỔ KỶ YẾU LỚP CHÚNG TA • LỚP 12A. NIÊN KHÓA 1993 - 1996",
    "✨ THANH XUÂN RỰC RỠ CHỈ CÓ MỘT LẦN • HÃY SỐNG HẾT MÌNH VỚI ĐAM MÊ",
    "🔥 LỚP CHỈ CHƠI HẾT SỨC - QUẬY HẾT GA",
    "💫 MÃI LÀ TRI KỶ CẬU NHÉ • CHÚC NHAU VỮNG BƯỚC TRÊN CON ĐƯỜNG PHÍA TRƯỚC",
    "🌿 TIẾNG NÓI CƯỜI HÀNH LANG LỚP HỌC • VẪN CÒN ĐÂY NHỮNG KỶ NIỆM THÂN YÊU",
  ];

  // Tripled loops to ensure smooth continuous slide
  const fullMarqueeText = [...marqueeSlogans, ...marqueeSlogans, ...marqueeSlogans].join("                ");

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#FAF6EE] flex flex-col items-center justify-center z-50">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5A5A40] via-yellow-600 to-[#5A5A40]"></div>
        <div className="text-center p-6 max-w-sm">
          <div className="relative w-16 h-16 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-dashed border-[#5A5A40]/30 rounded-full animate-spin [animation-duration:8s]"></div>
            <div className="absolute inset-2 border border-dashed border-[#5A5A40]/60 rounded-full"></div>
            <BookOpen className="text-[#5A5A40] animate-pulse" size={24} />
          </div>
          <h2 className="font-serif text-lg font-bold text-stone-800 tracking-wide mb-1 uppercase">
            Kỷ Yếu Lớp 12A
          </h2>
          <div className="w-16 h-0.5 bg-[#5A5A40]/30 mx-auto my-2"></div>
          <p className="text-xs text-[#5A5A40] font-sans font-bold animate-pulse">
            Đang tìm lại những mảnh ký ức xưa...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2] text-stone-800 font-serif selection:bg-[#E5E0C0] selection:text-[#5A5A40] pb-20 relative overflow-x-hidden">
      
      {/* 1. RUNNING MARQUEE TITLE (Tiêu đề chạy trên cùng) */}
      <div className="w-full bg-[#5A5A40] text-[#F5F5F0] py-4 shadow-sm border-b border-[#4A4A30] overflow-hidden relative z-50 select-none">
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#5A5A40] to-transparent z-10 pointer-events-none"></div>
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#5A5A40] to-transparent z-10 pointer-events-none"></div>
        
        <div className="overflow-hidden whitespace-nowrap flex items-center">
          <div className="animate-marquee-loop flex items-center pr-10">
            <span className="text-lg font-light tracking-[0.2em] uppercase flex items-center gap-2">
              {fullMarqueeText}
            </span>
          </div>
        </div>
      </div>

      {/* LOCAL FALLBACK CRITICAL NOTIFICATION BANNER */}
      {dbMode === "local" && (
        <div id="local-mode-banner" className="bg-amber-50 border-b border-amber-200 py-3 px-4 text-center text-xs text-amber-900 font-sans relative z-30 shadow-inner flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5 font-medium">
            <Database size={14} className="text-amber-700 animate-pulse" />
            {isQuotaExceeded ? (
              <span>⚠️ <strong>Chế độ Ngoại tuyến (Tự động):</strong> Đám mây Firestore tạm thời vượt quá hạn ngạch đọc ngày miễn phí của Google. Đã kích hoạt lưu trữ trình duyệt để không bị gián đoạn.</span>
            ) : (
              <span>ℹ️ <strong>Chế độ Ngoại tuyến:</strong> Dữ liệu đang lưu tại trình duyệt này. Bạn có thể tự do chỉnh sửa, phản hồi mà không lo hết hạn ngạch máy chủ!</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="underline hover:text-amber-950 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Download size={12} /> Sao lưu & khôi phục dữ liệu
            </button>
            {!isQuotaExceeded && (
              <button
                onClick={() => {
                  setDbMode("cloud");
                  localStorage.setItem("ky-yeu-db-mode", "cloud");
                  window.location.reload();
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded px-2.5 py-0.5 font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={10} /> Thử kết nối đám mây
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. MAIN HEADER & HERO */}
      <header className="max-w-5xl mx-auto px-4 pt-12 pb-8 text-center relative">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-5 pointer-events-none">
          <GraduationCap size={240} className="text-[#5A5A40]" />
        </div>

        {/* Hộp điều khiển hệ thống góc phải */}
        <div id="system-controls-box" className="absolute top-2 right-4 z-40 flex items-center gap-2">
          {/* Nút Sao lưu & khôi phục */}
          <button
            onClick={() => setIsBackupModalOpen(true)}
            className="px-2.5 py-1.5 bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-sm text-xs font-sans font-medium flex items-center gap-1 transition-all shadow-sm cursor-pointer"
            title="Sao lưu toàn bộ dữ liệu hoặc khôi phục từ file lưu"
          >
            <Download size={12} />
            <span className="hidden sm:inline">Sao Lưu</span>
          </button>

          {/* Nút Trạng thái CSDL */}
          <button
            onClick={() => {
              if (dbMode === "cloud") {
                setDbMode("local");
                localStorage.setItem("ky-yeu-db-mode", "local");
                loadAllLocalData();
              } else {
                setDbMode("cloud");
                localStorage.setItem("ky-yeu-db-mode", "cloud");
                window.location.reload();
              }
            }}
            className={`px-2.5 py-1.5 border rounded-sm text-xs font-sans font-medium flex items-center gap-1 transition-all shadow-sm cursor-pointer ${
              dbMode === "cloud"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
            title={dbMode === "cloud" ? "Đang kết nối Cloud Firestore. Bấm để chuyển ngoại tuyến" : "Đang lưu tại Trình duyệt. Bấm để chuyển kết nối Đám mây"}
          >
            <Database size={11} className={dbMode === "cloud" ? "animate-pulse font-bold" : ""} />
            <span className="hidden sm:inline">{dbMode === "cloud" ? "Máy Chủ" : "Ngoại Tuyến"}</span>
          </button>

          {isAdmin ? (
            <button
              onClick={() => {
                setIsAdmin(false);
                localStorage.removeItem("ky-yeu-is-admin");
              }}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-sm text-xs font-sans font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Đăng xuất khỏi quyền Thành Viên Lớp"
            >
              <Unlock size={12} />
              <span>Thành Viên (Đang Mở)</span>
            </button>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 rounded-sm text-xs font-sans font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Đăng nhập dành cho thành viên lớp"
            >
              <Lock size={12} />
              <span>Thành Viên Lớp</span>
            </button>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E8F3E8] text-[#405A40] text-xs font-sans font-semibold uppercase tracking-wider shadow-sm border border-[#C8DBC8]/50 mb-4">
            <Sparkles size={13} className="text-[#405A40] fill-[#405A40]/30" />
            Lưu giữ những năm tháng thanh xuân rực rỡ
          </span>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-wider text-[#5A5A40]">
            KỶ YẾU <span className="font-normal border-b-2 border-dashed border-[#E5E0C0] pb-1">12A.CMB - NIÊN KHÓA 93.96</span>
          </h1>
        </motion.div>
      </header>

      {/* VINTAGE SCRAPBOOK TABS NAVIGATION */}
      <div className="max-w-5xl mx-auto px-4 mb-10 relative z-30">
        <div className="flex flex-wrap items-end justify-center gap-2 md:gap-4 border-b border-[#E5E0C0] pb-px">
          {[
            { id: "portrait", label: "📸 ẢNH CHÂN DUNG", desc: "Lật về tuổi thơ", icon: <User size={15} /> },
            { id: "collective", label: "👥 TẬP THỂ LỚP", desc: "Khoảnh khắc ký ức chung", icon: <Users size={15} /> },
            { id: "memories", label: "🌸 ẢNH KỈ VẬT", desc: "Hiện vật & lưu bút", icon: <ImageIcon size={15} /> },
            { id: "guestbook", label: "📝 LƯU BÚT", desc: "Tâm sự & ký sự lớp", icon: <BookOpen size={15} /> },
            { id: "video", label: "🎥 VIDEO KHÁC", desc: "Thước phim hoài niệm", icon: <Video size={15} /> },
          ].map((tab) => {
            const isActive = activeMainTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id as any)}
                whileHover={{ 
                  y: isActive ? -8 : -5,
                  scale: 1.02,
                  boxShadow: isActive 
                    ? "0 -10px 25px rgba(143, 143, 110, 0.18), 0 -2px 6px rgba(143, 143, 110, 0.08)"
                    : "0 -8px 20px rgba(143, 143, 110, 0.10), 0 -2px 4px rgba(143, 143, 110, 0.04)"
                }}
                whileTap={{ scale: 0.98 }}
                animate={{
                  y: isActive ? -4 : 0,
                  transition: { type: "spring", stiffness: 300, damping: 20 }
                }}
                className={`flex-1 min-w-[130px] sm:min-w-[160px] md:max-w-[245px] px-3.5 py-4 text-center border-t border-x rounded-t-xl transition-all duration-300 relative cursor-pointer outline-none select-none ${
                  isActive
                    ? "bg-white border-[#C4BA92] text-[#4A4A2F] font-bold shadow-[0_-6px_20px_rgba(143,143,110,0.12),_0_-1px_3px_rgba(143,143,110,0.04)] z-20"
                    : "bg-[#F5F2E6]/60 border-transparent text-stone-500 hover:bg-white hover:text-[#5A5A40] z-10"
                }`}
                style={{
                  transformOrigin: "bottom center"
                }}
              >
                {/* Active Top Highlight Line */}
                {isActive && (
                  <motion.div 
                    layoutId="activeTabTopLine"
                    className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-amber-400 via-[#8F8F6E] to-emerald-500 rounded-t-xl"
                  />
                )}

                {/* Tab Label & Icon Wrapper */}
                <div className="text-[10px] sm:text-xs md:text-[15px] tracking-wide uppercase flex items-center justify-center gap-1.5 font-sans font-semibold transition-transform duration-300 whitespace-nowrap">
                  <span className={`transition-transform duration-300 ${isActive ? "scale-110 text-[#5A5A40]" : "opacity-80 group-hover:scale-115"}`}>
                    {tab.icon}
                  </span>
                  <span className={isActive ? "text-[#4A4A2F]" : "text-stone-600 hover:text-stone-800"}>
                    {tab.label}
                  </span>
                </div>

                {/* Tab Description */}
                <div className={`text-[10.5px] font-sans font-light mt-1.5 hidden sm:block transition-all duration-300 ${isActive ? "opacity-90 text-[#6B6B4F]" : "opacity-60 text-stone-500"}`}>
                  {tab.desc}
                </div>

                {/* Underline mask to cover the bottom border on active tab */}
                {isActive && (
                  <div className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-white z-30" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ===================== TAB PANEL 1: PORTRAITS (Ảnh chân dung) ===================== */}
      {activeMainTab === "portrait" && (
        <>
          {/* 3. CONTROLS BAR (SEARCH, FILTERS, ACTIONS) */}
          <section className="max-w-5xl mx-auto px-4 mb-10 z-20 relative">
            <div className="bg-white rounded-sm p-6 shadow-md border border-stone-200">
              
              {/* Row 1: Search & Admin Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                
                {/* Search Input & Vintage Photo Effects */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 max-w-2xl">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                      <Search size={18} />
                    </span>
                    <input
                      id="search-input"
                      type="text"
                      placeholder="Tìm bạn học, biệt danh, lời chúc..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-[#F9F7F2] border border-stone-200 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] text-sm font-sans transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Vintage Filter selection */}
                  <div className="flex items-center gap-1.5 bg-[#F9F7F2] rounded-md p-1.5 text-xs shrink-0 font-sans shadow-sm">
                    <span className="text-stone-600 font-semibold pl-1.5 pr-0.5 select-none text-[11px] uppercase tracking-wider flex items-center gap-1">
                      🎞️ Hiệu ứng:
                    </span>
                    <select
                      id="vintage-filter-select"
                      value={vintageFilter}
                      onChange={(e) => setVintageFilter(e.target.value as any)}
                      className="bg-white text-stone-700 py-1 px-2 rounded-md focus:outline-none text-xs cursor-pointer font-semibold transition-all hover:bg-stone-50 border-none cursor-pointer"
                    >
                      <option value="normal">Gốc (Không lọc)</option>
                      <option value="sepia">🟤 Sepia Cổ Kính</option>
                      <option value="bw">⚫ Đen Trắng Hoài Cổ</option>
                      <option value="warm">🟡 Phim Ấm Áp</option>
                      <option value="cool">🔵 Vintage Lạnh</option>
                      <option value="grainy">📻 Grain Nhiễu Hạt</option>
                    </select>
                  </div>
                </div>

                {/* Admin actions (Flip all, add, reset) */}
                <div className="flex flex-wrap items-center gap-2">
                  
                  <button
                    id="btn-flip-front"
                    onClick={handleFlipAllFront}
                    className="px-3.5 py-2 text-xs font-sans font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-sm transition-all flex items-center gap-1.5"
                    title="Lật tất cả gương mặt về ảnh chân dung"
                  >
                    <ImageIcon size={14} />
                    Lật Ảnh (Trước)
                  </button>

                  <button
                    id="btn-flip-back"
                    onClick={handleFlipAllBack}
                    className="px-3.5 py-2 text-xs font-sans font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-sm transition-all flex items-center gap-1.5"
                    title="Lật tất cả gương mặt để đọc lựu bút"
                  >
                    <MessageSquare size={14} />
                    Lật Tâm Sự (Sau)
                  </button>

                  <button
                    id="btn-add-member"
                    onClick={() => isAdmin ? setIsAddFormOpen(true) : setIsLoginModalOpen(true)}
                    className="px-4 py-2.5 text-xs font-sans font-bold text-white bg-[#5A5A40] hover:bg-[#4A4A30] rounded-sm shadow-sm transition-all flex items-center gap-1.5"
                  >
                    {isAdmin ? <PlusCircle size={16} /> : <Lock size={14} />}
                    Thêm Thành Viên
                  </button>
                </div>

              </div>

              {/* Active stats (Only show when searching to keep the interface minimal) */}
              {searchQuery && (
                <div className="mt-4 text-xs font-sans text-stone-400">
                  <span>Tìm thấy <span className="font-semibold text-[#5A5A40]">{filteredClassmates.length}</span> trên <span className="font-semibold text-stone-600">{classmates.length}</span> học sinh theo từ khóa tìm kiếm</span>
                </div>
              )}

            </div>
          </section>

          {/* 4. CENTRAL CLASSMATE FLIP-CARDS GRID (4 cột, một dòng gồm 4 ảnh) */}
          <main className="max-w-5xl mx-auto px-4 relative z-10">
            {classmates.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16 px-6 bg-white rounded-3xl border border-stone-200/80 shadow-sm max-w-xl mx-auto font-sans"
              >
                <HelpCircle size={48} className="mx-auto text-[#5A5A40] mb-4 opacity-75" />
                <h3 className="text-lg font-semibold text-stone-800 mb-2">Cơ sở dữ liệu của bạn chưa có thông tin</h3>
                <p className="text-stone-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
                  Chúng tôi phát hiện thấy cơ sở dữ liệu Firestore (ID: {databaseId || "(default)"}) hiện tại đang trống. Bạn có thể tự động nạp toàn bộ ảnh học sinh, ảnh tập thể, danh sách lớp học và lưu bút mẫu của lớp 12A.CMB chỉ với một cú click!
                </p>
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      await seedDatabase();
                      const dbSuffix = databaseId || "default";
                      localStorage.setItem(`ky-yeu-db-seeded-${dbSuffix}`, "true");
                    } catch (err) {
                      console.warn("Firestore Seed failed (quota/permissions), falling back to browser storage:", err);
                      setIsQuotaExceeded(true);
                      setDbMode("local");
                      localStorage.setItem("ky-yeu-db-mode", "local");
                      loadAllLocalData();
                      alert("⚠️ Máy chủ lưu trữ đang bận hoặc hết ngạch miễn phí hôm nay. Kỷ Yếu đã tự động kích hoạt Chế độ Trình duyệt, nạp thành công toàn bộ dữ liệu mẫu lớp học để bạn xem & tùy ý chỉnh sửa ngay!");
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-6 py-3 font-semibold text-white bg-[#5A5A40] hover:bg-[#484833] rounded-sm transition-all shadow-md inline-flex items-center gap-2 text-sm"
                >
                  ✨ Nạp Dữ Liệu Mẫu Ngay
                </button>
              </motion.div>
            ) : filteredClassmates.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 bg-white rounded-3xl border border-stone-200/80 shadow-sm max-w-xl mx-auto"
              >
                <HelpCircle size={48} className="mx-auto text-stone-400 mb-3" />
                <p className="text-stone-600 font-medium font-sans">Không tìm thấy thành viên lớp học thỏa mãn điều kiện.</p>
                <p className="text-xs text-stone-400 mt-1 font-sans">Vui lòng thử tìm kiếm bằng tên hoặc từ khóa khác.</p>
                <button
                  onClick={() => { setSearchQuery(""); setSelectedGroup("Tất Cả"); }}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-[#5A5A40] bg-[#F9F7F2] hover:bg-[#FEF9E7] border border-[#E5E0C0] rounded-sm transition-all font-sans"
                >
                  Hủy Tìm Kiếm
                </button>
              </motion.div>
            ) : (
              /* Strictly 4 Columns Layout on large screens: 2 columns on mobile, 4 on desktop */
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 md:gap-8">
                <AnimatePresence mode="popLayout">
                  {filteredClassmates.map((student, idx) => {
                    const isFlipped = !!flippedCards[student.id];
                    
                    // Polaroid rotational effect matching Natural Tones layout patterns
                    const rotations = ["-rotate-1", "rotate-1.5", "-rotate-1.5", "rotate-1", "-rotate-[2deg]", "rotate-[2deg]"];
                    const rotationClass = rotations[idx % rotations.length];

                    // Back side color palettes matching the Natural Tones CSS requirements
                    const backThemes = [
                      { bg: "bg-[#FEF9E7]", border: "border-[#E5E0C0]", text: "text-[#5A5A40]", headerBg: "bg-[#F5F0D0]" }, // Natural Cream Yellow
                      { bg: "bg-[#E8F3E8]", border: "border-[#C8DBC8]", text: "text-[#405A40]", headerBg: "bg-[#DBEADB]" }, // Soft Sage Green
                      { bg: "bg-[#FDF2F2]", border: "border-[#ECD9D9]", text: "text-[#6E4B4B]", headerBg: "bg-[#F7E1E1]" }, // Sweet Dusty Pink
                      { bg: "bg-[#F0F4F8]", border: "border-[#D6E2ED]", text: "text-[#3D4F5E]", headerBg: "bg-[#E0E9F2]" }  // Muted Sky Blue-gray
                    ];
                    const theme = backThemes[idx % backThemes.length];

                    let imageFilterClass = "w-full h-full object-cover grayscale-[15%] group-hover/card:grayscale-0 transition-all duration-500";
                    if (vintageFilter === "sepia") {
                      imageFilterClass = "w-full h-full object-cover sepia brightness-90 contrast-[1.02] saturate-[1.12] transition-all duration-500";
                    } else if (vintageFilter === "bw") {
                      imageFilterClass = "w-full h-full object-cover grayscale contrast-[1.25] brightness-[0.85] transition-all duration-500";
                    } else if (vintageFilter === "warm") {
                      imageFilterClass = "w-full h-full object-cover sepia-[0.3] saturate-[1.4] brightness-[0.92] contrast-[0.98] transition-all duration-500";
                    } else if (vintageFilter === "cool") {
                      imageFilterClass = "w-full h-full object-cover brightness-[0.93] contrast-[1.05] saturate-[0.8] hue-rotate-[-10deg] transition-all duration-500";
                    } else if (vintageFilter === "grainy") {
                      imageFilterClass = "w-full h-full object-cover sepia-[0.12] contrast-[1.12] brightness-[0.92] saturate-[0.9] transition-all duration-500";
                    }

                    return (
                      <motion.div
                        key={student.id}
                        id={`card-${student.id}`}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.35, delay: Math.min(idx * 0.05, 0.6) }}
                        className={`flex flex-col group/card transition-all duration-300 transform hover:scale-105 ${rotationClass}`}
                      >
                        
                        {/* Perspective card box container */}
                        <div 
                          onClick={() => {
                            setZoomedClassmate({ student, index: idx });
                            setIsZoomedFlipped(isFlipped);
                          }}
                          className="perspective-2000 w-full cursor-pointer select-none relative animate-fade-in h-[285px] sm:h-[360px] md:h-[410px]"
                        >
                          <div 
                            className={`w-full h-full relative preserve-3d flip-card-transition shadow-md hover:shadow-2xl hover:-translate-y-1.5 hover:shadow-[#5a5a40]/20 group-hover/card:shadow-2xl group-hover/card:shadow-[#5a5a40]/20 rounded-sm ${
                              isFlipped ? "rotate-y-180" : ""
                            }`}
                          >
                            
                            {/* ==================== FRONT SIDE (Mặt trước: Ảnh kỉ yếu dạng Polaroid) ==================== */}
                            <div className="absolute inset-0 w-full h-full rounded-sm bg-white border border-stone-200 p-2 pb-3.5 sm:p-4 sm:pb-6 flex flex-col justify-between backface-hidden overflow-hidden shadow-sm">
                              
                              {/* Top Card Accents */}
                              <div className="flex justify-between items-center text-xs text-stone-400 font-sans pb-2">
                                <span className="px-2 py-0.5 bg-[#F9F7F2] text-[#5A5A40] border border-stone-200/50 rounded text-[10px] uppercase font-bold tracking-wider mb-px">
                                  {student.group}
                                </span>
                                
                                {/* Washi Tape styling at the top of polaroid */}
                                <div className="w-14 h-4 bg-[#E5E0C0]/60 border border-dashed border-[#5A5A40]/10 shadow-sm rotate-2 -mt-5 absolute left-1/2 -translate-x-1/2 z-10"></div>
                                
                                <span className="text-[#5A5A40] font-sans font-bold text-[10px] flex items-center gap-1 bg-[#E8F3E8] px-1.5 py-0.5 rounded">
                                  🎓 12A
                                </span>
                              </div>
      
                              {/* Polaroid Image Box */}
                              <div className="w-full flex-1 aspect-square relative overflow-hidden bg-[#F9F7F2] border border-stone-100 group-hover/card:brightness-[1.01] transition-all">
                                <img
                                  src={student.avatarUrl}
                                  alt={student.name}
                                  referrerPolicy="no-referrer"
                                  className={imageFilterClass}
                                />
                                {vintageFilter === "grainy" && (
                                  <div 
                                    className="absolute inset-0 pointer-events-none opacity-[0.16] mix-blend-overlay"
                                    style={{
                                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                                    }}
                                  />
                                )}
                                
                                {/* Hover flip hint */}
                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex items-end p-2 justify-center">
                                  <span className="text-[10px] font-sans text-[#5A5A40] bg-white/95 px-2 py-1 shadow-sm border border-stone-200/80 rounded-sm">
                                    🔄 Chạm để lật bài
                                  </span>
                                </div>
                              </div>
      
                              {/* Polaroid Bottom hand-written caption look */}
                              <div className="mt-2 pt-1.5 sm:mt-4 sm:pt-3 border-t border-dashed border-stone-200 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <h3 className="font-serif text-[#5A5A40] text-sm xs:text-base sm:text-lg font-medium tracking-tight truncate max-w-[80%]">
                                    {student.name}
                                  </h3>
                                  {student.nickname && (
                                    <span className="text-[10px] sm:text-xs text-stone-400 italic max-w-[20%] truncate">
                                      ({student.nickname})
                                    </span>
                                  )}
                                </div>
                                <p className="text-[9px] sm:text-[11px] font-sans text-stone-500 tracking-wider uppercase mt-0.5 sm:mt-1">
                                  {student.role}
                                </p>
                              </div>

                              {/* Save photo option */}
                              <div className="absolute bottom-2 left-2 z-20">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPhoto(student.avatarUrl, student.name);
                                  }}
                                  className="text-stone-400 hover:text-[#5A5A40] transition-all p-1 rounded-full hover:bg-stone-50 cursor-pointer font-sans"
                                  title="Lưu ảnh chân dung về máy"
                                >
                                  <Download size={13} />
                                </button>
                              </div>

                              {/* Edit/Delete card option */}
                              {isAdmin && (
                                <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
                                  <button
                                    onClick={(e) => handleEditClassmate(student, e)}
                                    className="text-stone-400 hover:text-[#5A5A40] transition-all p-1 rounded-full hover:bg-stone-50 cursor-pointer font-sans"
                                    title="Sửa thông tin"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteClassmate(student.id, e)}
                                    className="text-stone-400 hover:text-rose-600 transition-all p-1 rounded-full hover:bg-stone-50 cursor-pointer font-sans"
                                    title="Xóa tấm thẻ này"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}

                            </div>
           
                            {/* ==================== BACK SIDE (Mặt sau: Lưu bút, thơ ca & tiếng cười) ==================== */}
                            <div className={`absolute inset-0 w-full h-full rounded-sm border ${theme.border} ${theme.bg} p-2.5 xs:p-3 sm:p-4.5 flex flex-col rotate-y-180 backface-hidden overflow-hidden shadow-inner`}>
                              
                              {/* Ruled lines decorative background */}
                              <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px)] [background-size:100%_24px] opacity-70 z-0"></div>
                              
                              {/* Card header */}
                              <div className="relative z-10 flex items-center justify-between pb-2 border-b border-stone-200/40">
                                <div className="flex items-center gap-1 font-sans">
                                  <Heart size={13} className="text-rose-500 fill-rose-500" />
                                  <span className={`text-[10px] font-bold tracking-wider ${theme.text}`}>TỔ LỚP: {student.group}</span>
                                </div>
                                
                                <span className={`text-[9px] font-sans font-medium px-2 py-0.5 rounded-full ${theme.headerBg} ${theme.text}`}>
                                  Mảnh Ký Ức
                                </span>
                              </div>

                              {/* Journal Text Paper Section */}
                              <div className="relative z-10 flex-1 flex flex-col justify-between mt-3 font-serif">
                                
                                <div>
                                  {/* Title block */}
                                  <div className={`flex items-center gap-1 mb-1.5 ${theme.text}`}>
                                    <BookOpen size={12} />
                                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider">Lưu Bút Viết Gửi:</span>
                                  </div>
      
                                  {/* Hand-written styled text block */}
                                  <blockquote className={`pl-1 text-xs italic leading-relaxed min-h-[90px] ${theme.text} opacity-90 select-all`}>
                                    "{student.quote}"
                                  </blockquote>
                                </div>
      
                                {student.funnyChat && (
                                  <div className="mt-2 text-left">
                                    {/* Title block */}
                                    <div className={`flex items-center gap-1 mb-1 ${theme.text}`}>
                                      <MessageSquare size={12} />
                                      <span className="text-[10px] font-sans font-bold uppercase tracking-wider">Góc Lội Nghịch Vui:</span>
                                    </div>
                                    
                                    {/* Conversation capsule */}
                                    <div className={`rounded-sm p-2 text-[11px] border border-[#5a5a40]/10 leading-normal relative font-sans ${theme.headerBg} ${theme.text}`}>
                                      {student.funnyChat}
                                    </div>
                                  </div>
                                )}
      
                                {/* Return instruction footer */}
                                <div className="pt-2 text-center text-[10px] font-sans text-stone-400 font-medium pb-2 border-t border-stone-200/40 mt-2">
                                  🔄 Nhấn lật thẻ để xem ảnh chân dung
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </main>
        </>
      )}

      {/* ===================== TAB PANEL 2: COLLECTIVES (Tập thể lớp) ===================== */}
      {activeMainTab === "collective" && (
        <section className="max-w-5xl mx-auto px-4 relative z-10">
          <div className="bg-white rounded-sm p-6 shadow-md border border-stone-200 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-normal text-stone-900 tracking-wide flex items-center gap-2">
                <Users className="text-[#5A5A40]" size={22} />
                <span>Kỷ Niệm Tập Thể Lớp 12A.CMB</span>
              </h2>
              <p className="text-xs text-stone-500 mt-1 font-sans">
                Nơi gom góp những kỷ niệm tươi đẹp thời cắp sách tới trường, tà áo thướt tha, nụ cười tinh nghịch dưới mái trường cổ kính.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2 self-start sm:self-center shrink-0">
              <button
                onClick={() => isAdmin ? setIsAlbumFormOpen(true) : setIsLoginModalOpen(true)}
                className="px-4 py-2.5 text-xs font-sans font-bold text-[#5A5A40] bg-[#FAF9F5] hover:bg-[#F2EFE4] hover:text-[#4A4A30] border border-[#5A5A40]/60 rounded-sm transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {isAdmin ? <FolderPlus size={15} /> : <Lock size={12} />}
                Tạo Album
              </button>
              <button
                onClick={() => isAdmin ? setIsColFormOpen(true) : setIsLoginModalOpen(true)}
                className="px-4 py-2.5 text-xs font-sans font-bold text-white bg-[#5A5A40] hover:bg-[#4A4A30] rounded-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isAdmin ? <PlusCircle size={15} /> : <Lock size={14} />}
                Đăng Ảnh Tập Thể
              </button>
            </div>
          </div>

          {/* Albums Navigation Bar */}
          <div className="flex flex-wrap items-center gap-2 mb-6 bg-[#FAF9F5] p-3 rounded-sm border border-[#E5E0C0]/55 shadow-sm">
            <span className="text-[11px] font-sans font-bold uppercase text-[#5A5A40] tracking-wider mr-2">Bộ Sưu Tập Albums:</span>
            <button
              onClick={() => setSelectedAlbumId("all")}
              className={`px-3 py-1.5 text-xs font-sans rounded-sm transition-all cursor-pointer border ${
                selectedAlbumId === "all"
                  ? "bg-[#5A5A40] text-white border-[#5A5A40] font-semibold shadow-sm"
                  : "bg-white text-stone-600 border-stone-250/70 hover:bg-[#F5F2E6] hover:text-[#5A5A40]"
              }`}
            >
              📚 Tất cả
            </button>
            {collectiveAlbums.map((album) => (
              <button
                key={album.id}
                onClick={() => setSelectedAlbumId(album.id)}
                className={`px-3 py-1.5 text-xs font-sans rounded-sm transition-all cursor-pointer border flex items-center gap-1.5 ${
                  selectedAlbumId === album.id
                    ? "bg-[#5A5A40] text-white border-[#5A5A40] font-semibold shadow-sm"
                    : "bg-white text-stone-600 border-stone-250/70 hover:bg-[#F5F2E6] hover:text-[#5A5A40]"
                }`}
                title={album.description}
              >
                <Folder size={12} className={selectedAlbumId === album.id ? "text-white" : "text-[#8F8F6E]"} />
                {album.name}
              </button>
            ))}
          </div>

          {/* Description of active album and Delete button option */}
          {selectedAlbumId !== "all" && (
            <div className="bg-[#FAF9F5] p-4 rounded-sm border-l-4 border-[#5A5A40] shadow-sm mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1 w-full">
                <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">
                  🏷️ Album: {collectiveAlbums.find(a => a.id === selectedAlbumId)?.name}
                </h3>
                <p className="text-[11px] text-stone-500 mt-1 italic font-sans">
                  {collectiveAlbums.find(a => a.id === selectedAlbumId)?.description || "Bộ sưu tập những hình ảnh lưu giữ kỷ niệm tuyệt vời."}
                </p>

                {/* Choose Layout Mode */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-wider">Chế độ xem:</span>
                  <div className="inline-flex rounded-sm bg-stone-200/50 p-0.5 border border-stone-250">
                    <button
                      onClick={() => setGalleryViewMode("book")}
                      className={`px-3 py-1 text-[9px] uppercase tracking-wide font-sans font-bold rounded-xs transition-all cursor-pointer ${
                        galleryViewMode === "book"
                          ? "bg-[#5A5A40] text-white shadow-xs"
                          : "text-stone-600 hover:text-[#5A5A40] hover:bg-white/40"
                      }`}
                    >
                      📖 Lật Sách 3D
                    </button>
                    <button
                      onClick={() => setGalleryViewMode("grid")}
                      className={`px-3 py-1 text-[9px] uppercase tracking-wide font-sans font-bold rounded-xs transition-all cursor-pointer ${
                        galleryViewMode === "grid"
                          ? "bg-[#5A5A40] text-white shadow-xs"
                          : "text-stone-600 hover:text-[#5A5A40] hover:bg-white/40"
                      }`}
                    >
                      📱 Dạng Lưới
                    </button>
                  </div>
                </div>

                {/* ZIP Download progress indicator */}
                {zipProgress.status !== "idle" && (
                  <div className="mt-3 p-2.5 bg-[#FAF8F5] rounded border border-[#E5E0C0] text-[11px] font-sans">
                    <div className="flex justify-between items-center mb-1 text-stone-600">
                      <span className="font-semibold text-stone-700">
                        {zipProgress.status === "preparing" && "⏳ "}
                        {zipProgress.status === "downloading" && "📥 "}
                        {zipProgress.status === "compressing" && "🗜️ "}
                        {zipProgress.status === "done" && "✅ "}
                        {zipProgress.status === "error" && "❌ "}
                        {zipProgress.message}
                      </span>
                      <span className="font-bold text-[#5A5A40]">
                        {zipProgress.status === "downloading" && `${zipProgress.current}/${zipProgress.total}`}
                        {zipProgress.status === "compressing" && "100%"}
                      </span>
                    </div>
                    {zipProgress.status !== "done" && zipProgress.status !== "error" && (
                      <div className="w-full bg-stone-200 rounded-full h-1 overflow-hidden mt-1">
                        <div 
                          className="bg-[#5A5A40] h-1 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${
                              zipProgress.status === "downloading" 
                                ? (zipProgress.current / zipProgress.total) * 100 
                                : zipProgress.status === "compressing" 
                                  ? 95 
                                  : 5
                            }%` 
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() => handleDownloadAllPhotos(selectedAlbumId)}
                  disabled={zipProgress.status !== "idle" && zipProgress.status !== "done"}
                  className="text-white bg-[#8F8F6E] hover:bg-[#7a7a5c] disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors cursor-pointer text-[10px] uppercase font-sans font-bold flex items-center gap-1 p-1.5 rounded shadow-xs"
                >
                  <Download size={11} />
                  {zipProgress.status !== "idle" && zipProgress.status !== "done" ? "Đang Xử Lý..." : "Tải Toàn Bộ Ảnh"}
                </button>

                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setNewColAlbumId(selectedAlbumId);
                        setNewColUrlChoice("upload");
                        setDirectUploadAlbumId(selectedAlbumId);
                        setIsColFormOpen(true);
                      }}
                      className="text-white bg-[#5A5A40] hover:bg-[#4A4A30] transition-colors cursor-pointer text-[10px] uppercase font-sans font-bold flex items-center gap-1 p-1.5 rounded"
                    >
                      <PlusCircle size={11} />
                      Thêm Ảnh
                    </button>
                    <button
                      onClick={() => {
                        const album = collectiveAlbums.find(a => a.id === selectedAlbumId);
                        if (album) {
                          setEditingAlbumId(album.id);
                          setNewAlbumName(album.name);
                          setNewAlbumDesc(album.description || "");
                          setIsAlbumFormOpen(true);
                        }
                      }}
                      className="text-[#5A5A40] hover:text-[#4A4A30] hover:bg-stone-50 transition-colors cursor-pointer text-[10px] uppercase font-sans font-bold flex items-center gap-1 border border-dashed border-[#5A5A40]/30 p-1.5 rounded"
                    >
                      <Edit3 size={11} />
                      Sửa Album
                    </button>
                    <button
                      onClick={() => {
                        const album = collectiveAlbums.find(a => a.id === selectedAlbumId);
                        setConfirmTarget({
                          type: "album",
                          id: selectedAlbumId,
                          title: "Xóa Album Kỷ Niệm",
                          message: `Bạn có chắc chắn muốn xóa album "${album ? album.name : ''}"? Các hình ảnh trong album sẽ không bị xóa mà sẽ chuyển về mục "Tất cả".`
                        });
                      }}
                      className="text-stone-400 hover:text-rose-600 transition-colors cursor-pointer text-[10px] uppercase font-sans font-bold flex items-center gap-1 border border-dashed border-stone-300 p-1.5 rounded"
                    >
                      <Trash2 size={11} />
                      Xoá Album này
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {(() => {
            const listToRender = selectedAlbumId === "all" 
              ? collectivePhotos
              : collectivePhotos.filter(photo => photo.albumId === selectedAlbumId);

            if (listToRender.length === 0) {
              return (
                <div className="text-center py-16 bg-white rounded-sm border border-stone-200 shadow-sm max-w-xl mx-auto">
                  <ImageIcon size={48} className="mx-auto text-stone-300 mb-2" />
                  <p className="text-stone-600 font-medium font-sans">Chưa có bức ảnh nào trong album này.</p>
                  <button
                    onClick={() => isAdmin ? setIsColFormOpen(true) : setIsLoginModalOpen(true)}
                    className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#5A5A40] rounded-sm font-sans flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    {isAdmin ? <PlusCircle size={14} /> : <Lock size={12} />}
                    Đăng Ảnh Đầu Tiên Ngay 📸
                  </button>
                </div>
              );
            }

            if (selectedAlbumId !== "all" && galleryViewMode === "book") {
              const activeAlbum = collectiveAlbums.find(a => a.id === selectedAlbumId);
              return (
                <YearbookFlipbook
                  albumName={activeAlbum ? activeAlbum.name : ""}
                  albumDesc={activeAlbum ? activeAlbum.description : ""}
                  photos={listToRender}
                  onViewLarge={(photo) => setLightboxPhoto(photo)}
                  onDownload={handleDownloadPhoto}
                />
              );
            }

            return (
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-8">
                {listToRender.map((photo, idx) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className="bg-white border border-stone-200 p-2.5 pb-4 sm:p-4 sm:pb-6 rounded-sm shadow-md hover:shadow-xl transition-all relative group"
                >
                  {/* Tape Styling */}
                  <div className="w-20 h-5 bg-[#C8DBC8]/50 border border-dashed border-[#5D705D]/20 shadow-sm -rotate-3 absolute -top-2.5 left-1/2 -translate-x-1/2 z-10"></div>
                  
                  {/* Photo area */}
                  <div 
                    onClick={() => setLightboxPhoto({ url: photo.url, title: photo.title, description: photo.description || "" })}
                    className="aspect-[4/3] w-full overflow-hidden bg-stone-50 border border-stone-100 relative group/photo cursor-pointer"
                  >
                    <img
                      src={photo.url}
                      alt={photo.title}
                      className="w-full h-full object-cover group-hover/photo:scale-[1.03] transition-all duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-stone-950/30 opacity-0 group-hover/photo:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1">
                      <div className="p-2.5 bg-[#5A5A40]/90 backdrop-blur-sm rounded-full text-white shadow-md transform scale-90 group-hover/photo:scale-100 transition-all duration-300">
                        <Maximize2 size={14} />
                      </div>
                      <span className="text-[10px] text-white font-sans font-medium uppercase tracking-wider bg-stone-900/60 px-2 py-0.5 rounded-sm">Xem toàn màn hình</span>
                    </div>
                  </div>

                  {/* Caption */}
                  <div className="mt-3 pt-3 border-t border-dashed border-stone-200 text-center font-serif flex flex-col justify-between h-auto">
                    <div className="mb-3">
                      <h3 className="text-sm sm:text-base text-stone-900 font-medium tracking-tight mb-1">
                        {photo.title}
                      </h3>
                      {photo.date && (
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] uppercase font-sans tracking-wide text-[#5A5A40] bg-[#F9F7F2] border border-stone-200/40 px-2 py-0.5 rounded mb-2">
                          <Calendar size={9} />
                          {photo.date}
                        </span>
                      )}
                      <p className="text-[11px] sm:text-xs text-stone-600 font-normal leading-relaxed text-left font-sans font-light mt-1">
                        {photo.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      <button
                        onClick={() => setLightboxPhoto({ url: photo.url, title: photo.title, description: photo.description || "" })}
                        className="flex items-center justify-center gap-1.5 py-1.5 bg-[#F9F7F2] hover:bg-[#5A5A40]/90 hover:text-white border border-stone-200/60 text-[#5A5A40] rounded-sm text-[10px] sm:text-xs font-semibold font-sans transition-all cursor-pointer"
                        title="Xem toàn màn hình"
                      >
                        <Maximize2 size={11} />
                        <span>Xem Ảnh</span>
                      </button>
                      <button
                        onClick={() => handleDownloadPhoto(photo.url, photo.title)}
                        className="flex items-center justify-center gap-1.5 py-1.5 bg-[#F9F7F2] hover:bg-[#5A5A40]/90 hover:text-white border border-stone-200/60 text-[#5A5A40] rounded-sm text-[10px] sm:text-xs font-semibold font-sans transition-all cursor-pointer"
                        title="Tải ảnh tập thể này về máy"
                      >
                        <Download size={11} />
                        <span>Tải Về</span>
                      </button>
                    </div>
                  </div>

                  {/* Edit/Delete Options */}
                  {isAdmin && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 transition-all z-20">
                      <button
                        onClick={() => handleEditColPhoto(photo)}
                        className="p-1.5 bg-white/95 hover:bg-stone-50 text-stone-400 hover:text-[#5A5A40] border border-stone-200/50 rounded-sm shadow-sm cursor-pointer"
                        title="Sửa bức ảnh này"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteCol(photo.id)}
                        className="p-1.5 bg-white/95 hover:bg-rose-100 text-stone-400 hover:text-rose-600 border border-stone-200/50 rounded-sm shadow-sm cursor-pointer"
                        title="Xóa tấm ảnh này"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
              </div>
            );
          })()}
        </section>
      )}

      {/* ===================== TAB PANEL 3: MEMORIES (Ảnh kỉ niệm) ===================== */}
      {activeMainTab === "memories" && (
        <section className="max-w-5xl mx-auto px-4 relative z-10">
          <div className="bg-white rounded-sm p-6 shadow-md border border-stone-200 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-normal text-stone-900 tracking-wide flex items-center gap-2">
                <Sparkles className="text-[#5A5A40]" size={22} />
                <span>Góc Kỷ Vật & Hiện Vật Học Đường</span>
              </h2>
              <p className="text-xs text-stone-500 mt-1 font-sans">
                Nơi ghi lại những vật phẩm mang tính biểu tượng của niên khóa 1993 - 1996 giúp gọi về cả bầu trời mộng mơ.
              </p>
            </div>
            <button
              onClick={() => isAdmin ? setIsMemFormOpen(true) : setIsLoginModalOpen(true)}
              className="px-4 py-2.5 text-xs font-sans font-bold text-white bg-[#5A5A40] hover:bg-[#4A4A30] rounded-sm shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer"
            >
              {isAdmin ? <PlusCircle size={16} /> : <Lock size={14} />}
              Đăng Kỷ Vật Mới
            </button>
          </div>

          {memoryPhotos.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-sm border border-stone-200 shadow-sm max-w-xl mx-auto">
              <Sparkles size={48} className="mx-auto text-stone-300 mb-2" />
              <p className="text-stone-600 font-medium font-sans">Mục kỉ niệm hiện vật đang trống.</p>
              <button
                onClick={() => isAdmin ? setIsMemFormOpen(true) : setIsLoginModalOpen(true)}
                className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#5A5A40] rounded-sm font-sans flex items-center gap-1 mx-auto cursor-pointer"
              >
                {isAdmin ? <PlusCircle size={14} /> : <Lock size={12} />}
                Tải Kỷ Vật Lên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
              {memoryPhotos.map((item, idx) => {
                const colors = ["bg-[#FEF9E7]/80 border-[#E5E0C0]/80", "bg-[#E8F3E8]/80 border-[#C8DBC8]/80", "bg-[#FDF2F2]/80 border-[#ECD9D9]/80", "bg-[#F0F4F8]/80 border-[#D6E2ED]/80"];
                const colorClass = colors[idx % colors.length];
                
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, delay: idx * 0.05 }}
                    className={`p-2.5 sm:p-4 rounded-sm border shadow-sm relative group flex flex-col justify-between ${colorClass}`}
                  >
                    <div>
                      {/* Photo preview */}
                      <div 
                        onClick={() => setLightboxPhoto({ url: item.url, title: item.title, description: item.description || "" })}
                        className="aspect-square w-full overflow-hidden rounded-sm border border-stone-200/20 mb-3 bg-stone-50 relative group/photo cursor-pointer"
                      >
                        <img
                          src={item.url}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover/photo:scale-[1.03] transition-all duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-stone-950/30 opacity-0 group-hover/photo:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1">
                          <div className="p-2 bg-[#5A5A40]/90 backdrop-blur-sm rounded-full text-white shadow-md transform scale-90 group-hover/photo:scale-100 transition-all duration-300">
                            <Maximize2 size={13} />
                          </div>
                          <span className="text-[10px] text-white font-sans font-medium uppercase tracking-wider bg-stone-900/60 px-2 py-0.5 rounded-sm">Xem chi tiết</span>
                        </div>
                      </div>
                      <h3 className="text-sm sm:text-base font-medium text-stone-850 font-serif leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-stone-600 font-normal leading-relaxed mt-2 font-sans font-light">
                        {item.description}
                      </p>

                      <div className="grid grid-cols-2 gap-1.5 mt-3">
                        <button
                          onClick={() => setLightboxPhoto({ url: item.url, title: item.title, description: item.description || "" })}
                          className="flex items-center justify-center gap-1.5 py-1 px-2 bg-stone-50 hover:bg-[#5A5A40]/90 hover:text-white border border-[#DCD5B0]/50 hover:border-[#5A5A40] text-stone-600 rounded-sm text-[10px] sm:text-[11px] font-sans font-medium transition-all cursor-pointer"
                          title="Xem toàn màn hình"
                        >
                          <Maximize2 size={11} />
                          <span>Xem Ảnh</span>
                        </button>
                        <button
                          onClick={() => handleDownloadPhoto(item.url, item.title)}
                          className="flex items-center justify-center gap-1.5 py-1 px-2 bg-stone-50 hover:bg-[#5A5A40]/90 hover:text-white border border-[#DCD5B0]/50 hover:border-[#5A5A40] text-stone-600 rounded-sm text-[10px] sm:text-[11px] font-sans font-medium transition-all cursor-pointer"
                          title="Tải ảnh kỷ niệm về máy"
                        >
                          <Download size={11} />
                          <span>Tải Về</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-dashed border-stone-350 flex justify-between items-center text-[10px] font-sans text-stone-400 font-semibold">
                      <span>🌸 Kỷ niệm 93-96</span>
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditMemPhoto(item)}
                            className="text-stone-400 hover:text-[#5A5A40] transition-colors cursor-pointer"
                            title="Sửa kỷ niệm này"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteMem(item.id)}
                            className="text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Xóa kỷ niệm này"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ===================== TAB PANEL GUESTBOOK: LƯU BÚT LỚP ===================== */}
      {activeMainTab === "guestbook" && (
        <section className="max-w-5xl mx-auto px-4 relative z-10">
          <div className="bg-white rounded-sm p-6 shadow-md border border-stone-200 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-normal text-stone-900 tracking-wide flex items-center gap-2">
                <BookOpen className="text-[#5A5A40]" size={22} />
                <span>Trang Lưu Bút Học Trò</span>
              </h2>
              <p className="text-xs text-stone-500 mt-1 font-sans">
                Nơi lưu giữ những bức ký sự, tâm sự mộc mạc và những lời nhắn nhủ chan chứa thân yêu gửi về cho tập thể lớp 12A thân thương.
              </p>
            </div>
            <button
              onClick={() => setIsGuestbookFormOpen(true)}
              className="px-4 py-2.5 text-xs font-sans font-bold text-white bg-[#5A5A40] hover:bg-[#4A4A30] rounded-sm shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer"
            >
              <PlusCircle size={16} />
              Gửi Lưu Bút Mới
            </button>
          </div>

          {guestbookEntries.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-sm border border-stone-200 shadow-sm max-w-xl mx-auto">
              <BookOpen size={48} className="mx-auto text-stone-300 mb-2" />
              <p className="text-stone-600 font-medium font-sans animate-pulse">Chưa có trang lưu bút nào được đăng.</p>
              <button
                onClick={() => setIsGuestbookFormOpen(true)}
                className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#5A5A40] rounded-sm font-sans flex items-center gap-1 mx-auto cursor-pointer"
              >
                <PlusCircle size={14} />
                Gửi Lời Tâm Sự Đầu Tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {guestbookEntries.map((item, idx) => {
                let cardColor = "#FFFDF5"; // default cream
                let gridColor = "rgba(62, 115, 171, 0.08)"; // classic ink-blue grid
                let borderClass = "border-amber-200/50";
                let tagLabel = "Trang Ô Ly Nắng Ấm";

                if (item.bgStyle === "green") {
                  cardColor = "#F4FAF2"; // mint green
                  gridColor = "rgba(16, 120, 16, 0.07)"; // light green grid
                  borderClass = "border-emerald-250/50";
                  tagLabel = "Trang Ô Ly Thảo Nguyên";
                } else if (item.bgStyle === "pink") {
                  cardColor = "#FFF5F7"; // soft pink
                  gridColor = "rgba(190, 40, 120, 0.06)"; // soft pink/fuchsia grid
                  borderClass = "border-rose-250/50";
                  tagLabel = "Trang Ô Ly Mực Tím";
                } else if (item.bgStyle === "blue") {
                  cardColor = "#F2F7FD"; // soft blue
                  gridColor = "rgba(50, 120, 200, 0.07)"; // blue grid
                  borderClass = "border-sky-250/50";
                  tagLabel = "Trang Ô Ly Tuổi Hồng";
                }

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                    className={`rounded-sm border relative flex flex-col justify-between overflow-hidden min-h-[280px] ${borderClass}`}
                    style={{
                      backgroundColor: cardColor,
                      backgroundImage: `
                        linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                        linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
                      `,
                      backgroundSize: "20px 20px",
                      backgroundPosition: "38px 0px",
                      boxShadow: "1px 1px 0px #fff, 2px 2px 0px rgba(0,0,0,0.03), 3px 3px 0px #fff, 4px 4px 0px rgba(0,0,0,0.03), 0px 8px 24px -4px rgba(0,0,0,0.12)"
                    }}
                  >
                    {/* Spiral Wire-O Binding Rings */}
                    <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-around py-6 z-20 pointer-events-none select-none">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="relative flex items-center" style={{ height: "20px" }}>
                          {/* Punch Hole */}
                          <div className="w-2.5 h-2.5 rounded-full bg-stone-950/20 border border-stone-200/20 ml-2.5 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.3)] bg-[#E0DEC9]" />
                          {/* Silver Spiral Ring */}
                          <div 
                            className="absolute bg-transparent" 
                            style={{ 
                              left: "-2px", 
                              width: "18px", 
                              height: "11px", 
                              borderRadius: "6px", 
                              border: "1.5px solid #a8a29e", 
                              borderLeftColor: "transparent",
                              transform: "rotate(12deg)",
                              filter: "drop-shadow(1px 1px 1.5px rgba(0,0,0,0.2))"
                            }} 
                          />
                        </div>
                      ))}
                    </div>

                    {/* Red Schoolbook Margin (Kẻ lề huyền thoại) */}
                    <div className="absolute top-0 bottom-0 left-[38px] sm:left-[46px] w-[1px] bg-red-400/40 z-10" />

                    {/* Top Right Page stamp */}
                    <div className="absolute top-2 right-4 flex items-center gap-1.5 text-[9px] font-sans text-stone-400 select-none z-10 pointer-events-none">
                      <span className="uppercase tracking-widest text-[8px] opacity-75 hidden xs:inline">{tagLabel}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400/40 hidden xs:inline" />
                      <span className="font-mono text-stone-500 font-semibold bg-white/40 px-1 py-0.5 border border-dashed border-stone-300">Trang {(idx + 1).toString().padStart(2, "0")}</span>
                    </div>

                    {/* Writing Area */}
                    <div className="pl-[50px] sm:pl-[60px] pr-4 sm:pr-6 pt-10 pb-4 flex-1 flex flex-col justify-between z-10">
                      <div>
                        {/* Title of memory post - handwritten letter style */}
                        <h3 className="text-sm xs:text-base sm:text-lg font-bold font-serif text-stone-900 border-b border-rose-400/15 pb-1 mb-4 leading-snug tracking-wide">
                          ✏️ {item.title}
                        </h3>

                        {/* Story text aligning matching grid spacing (line-height of 20px aligns perfectly on our 20px grid background!) */}
                        <div 
                          className="text-xs xs:text-sm text-stone-850 font-serif font-medium whitespace-pre-wrap tracking-wide mb-6 leading-[20px] select-text"
                          style={{ minHeight: "80px", textShadow: "0.2px 0.2px 0px rgba(0, 0, 0, 0.05)" }}
                        >
                          {item.content}
                        </div>
                      </div>

                      {/* Footer signatures and interaction buttons */}
                      <div className="border-t border-dashed border-stone-300 pt-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-stone-800 font-sans tracking-wide">
                            ✍️ <span className="font-serif italic text-sm text-[#5A5A40] font-normal">{item.sender}</span>
                          </p>
                          {item.date && (
                            <p className="text-[10px] text-stone-500 font-sans mt-0.5 whitespace-nowrap">
                              ⏳ Giờ: {item.date}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleEditGuestbook(item)}
                            className="px-2 py-1 text-[10px] uppercase font-sans font-bold border border-[#5A5A40]/30 rounded-xs text-[#5A5A40] bg-white/50 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
                            title="Chỉnh sửa bài viết"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteGuestbook(item.id)}
                            className="px-2 py-1 text-[10px] uppercase font-sans font-bold border border-rose-250 rounded-xs text-rose-600 bg-white/50 hover:bg-rose-50/75 hover:border-rose-300 transition-all cursor-pointer"
                            title="Xoá bài viết"
                          >
                            Xoá
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ===================== TAB PANEL 4: VIDEO (Thước phim) ===================== */}
      {activeMainTab === "video" && (
        <section className="max-w-5xl mx-auto px-4 relative z-10">
          <div className="bg-white rounded-sm p-6 shadow-md border border-stone-200 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-normal text-stone-900 tracking-wide flex items-center gap-2">
                <Video className="text-[#5A5A40]" size={22} />
                <span>Thước Phim Hoài Niệm Cuộc Sống Học Đường</span>
              </h2>
              <p className="text-xs text-stone-500 mt-1 font-sans">
                Những cuộn băng VHS bụi bặm được lội ngược dòng thời gian, sống dậy những nụ cười trong trẻo tinh khôi của thời niên thiếu.
              </p>
            </div>
            <button
              onClick={() => isAdmin ? setIsVidFormOpen(true) : setIsLoginModalOpen(true)}
              className="px-4 py-2.5 text-xs font-sans font-bold text-white bg-[#5A5A40] hover:bg-[#4A4A30] rounded-sm shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer"
            >
              {isAdmin ? <PlusCircle size={16} /> : <Lock size={14} />}
              Gửi Đăng Video
            </button>
          </div>

          {memoryVideos.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-sm border border-stone-200 shadow-sm max-w-xl mx-auto">
              <Video size={48} className="mx-auto text-stone-300 mb-2" />
              <p className="text-stone-600 font-medium font-sans">Chưa có video hoài niệm nào hiện hữu.</p>
              <button
                onClick={() => isAdmin ? setIsVidFormOpen(true) : setIsLoginModalOpen(true)}
                className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#5A5A40] rounded-sm font-sans flex items-center gap-1 mx-auto cursor-pointer"
              >
                {isAdmin ? <PlusCircle size={14} /> : <Lock size={12} />}
                Đăng Gửi Video Đầu Tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Theater Main View (Left col spans 2) */}
              <div className="lg:col-span-2 space-y-4">
                {(() => {
                  const currentVideo = memoryVideos.find(v => v.id === activeVideoId) || memoryVideos[0];
                  if (!currentVideo) return null;
                  return (
                    <div className="bg-white border border-stone-202 p-4 rounded-sm shadow-md">
                      {/* Video Player Box with retro TV outer feel */}
                      <div className="aspect-video w-full bg-black rounded-sm overflow-hidden relative shadow-inner border border-stone-900">
                        <iframe
                          className="w-full h-full"
                          src={getEmbedUrl(currentVideo.url)}
                          title={currentVideo.title}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        ></iframe>
                      </div>
                      
                      <div className="mt-4 font-serif">
                        <h3 className="text-xl text-stone-900 font-medium tracking-tight flex items-center gap-2">
                          <Film size={18} className="text-[#5A5A40]" />
                          <span>{currentVideo.title}</span>
                        </h3>
                        <p className="text-sm text-stone-600 max-w-3xl mt-2 font-sans font-light leading-relaxed">
                          {currentVideo.description}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Playlist Selection (Right col) */}
              <div className="space-y-4">
                <span className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider font-sans block">
                  Danh Sách Cuộn Băng Kỷ Niệm ({memoryVideos.length})
                </span>
                
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {memoryVideos.map((item) => {
                    const isActive = item.id === (activeVideoId || memoryVideos[0]?.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setActiveVideoId(item.id)}
                        className={`p-3.5 rounded-sm border cursor-pointer transition-all relative group flex gap-3 items-start ${
                          isActive
                            ? "bg-white border-[#E5E0C0] shadow-sm ring-1 ring-[#5A5A40]/10"
                            : "bg-[#F9F7F2]/60 hover:bg-white border-stone-200/80"
                        }`}
                      >
                        {/* Compact icon symbol */}
                        <div className={`p-2 rounded shrink-0 ${isActive ? "bg-[#E8F3E8] text-[#405A40]" : "bg-stone-100 text-stone-400 group-hover:text-[#5A5A40]"}`}>
                          <Film size={16} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className={`text-xs md:text-sm font-medium leading-tight truncate ${isActive ? "text-[#5A5A40] font-bold" : "text-stone-800"}`}>
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-stone-500 font-sans truncate mt-1 font-light">
                            {item.description}
                          </p>
                        </div>

                        {/* Edit/Delete video */}
                        {isAdmin && (
                          <div className="flex items-center gap-1.5 self-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditVideo(item);
                              }}
                              className="text-stone-400 hover:text-[#5A5A40] transition-colors p-1 rounded-sm cursor-pointer"
                              title="Sửa video này"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteVid(item.id);
                              }}
                              className="text-stone-300 hover:text-rose-600 transition-colors p-1 rounded-sm cursor-pointer"
                              title="Xóa video này"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </section>
      )}

      {/* 5. ADD STUDENT MODAL / OVERLAY (Form thêm thành viên kỉ yếu) */}
      <AnimatePresence>
        {isAddFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseClassmateForm}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="add-member-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-2xl w-full p-6 md:p-8 relative z-10 overflow-y-auto max-h-[90vh]"
            >
              <button
                onClick={handleCloseClassmateForm}
                aria-label="Close"
                className="absolute top-2 right-2 p-3.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100/60 transition-all duration-300 hover:rotate-90 cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#5A5A40]">
                {editingClassmateId ? <Edit3 size={24} /> : <PlusCircle size={24} />}
                <h2 className="text-xl md:text-2xl font-normal tracking-wide">
                  {editingClassmateId ? "Cập Nhật Thông Tin Thành Viên" : "Ghi Danh Thành Viên Mới"}
                </h2>
              </div>
              
              <p className="text-xs text-stone-500 mb-6 leading-relaxed font-sans font-light">
                Hãy khởi tạo và lưu giữ kỉ niệm của bạn học thân thương vào lưu bút lớp học! Phiếu thông tin này được lưu cục bộ an toàn trên trình duyệt của bạn.
              </p>

              <form onSubmit={handleAddSubmit} className="space-y-5 font-sans font-light">
                
                {/* Name & Nickname row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                      Họ và Tên <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Nguyễn Văn A"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                      Biệt Danh / Tên Thường Gọi
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Hải Phòng, Tèo Còi"
                      value={newNickname}
                      onChange={(e) => setNewNickname(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Role Row */}
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Vai Trò / Chức Danh Lớp <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Nhạc Sĩ Lớp, Trùm Ăn Quẩy"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* HEARTFELT WRITING / DIALOUGE (Tâm sự & Lời chúc / Câu chuyện cười) */}
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Tâm Sự & Lời Chúc Gửi Lớp <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Hãy điền những lời lưu bút chân quý, hoài bão niên khóa thời học sinh..."
                    value={newQuote}
                    onChange={(e) => setNewQuote(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Câu nói vui vẻ / Sự tích lầy lội ghi nhớ
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: 'Một thời bị phạt tập thể ở hành lang vì giấu bảng đen của lớp trưởng!'"
                    value={newFunnyChat}
                    onChange={(e) => setNewFunnyChat(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* AVATAR/GRADUATION PORTRAIT CHOICE */}
                <div className="bg-white rounded-sm p-4 border border-stone-200">
                  <span className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-3">
                    Hình ảnh chân dung kỷ yếu
                  </span>

                  {/* Switch option */}
                  <div className="flex flex-wrap gap-4 mb-4 text-xs font-semibold">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="img-opt"
                        checked={imageUrlOption === "upload"}
                        onChange={() => setImageUrlOption("upload")}
                        className="text-[#5A5A40] focus:ring-[#5A5A40] accent-[#5A5A40]"
                      />
                      <span>Tải Ảnh Từ Bạn Lên</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="img-opt"
                        checked={imageUrlOption === "url"}
                        onChange={() => setImageUrlOption("url")}
                        className="text-[#5A5A40] focus:ring-[#5A5A40] accent-[#5A5A40]"
                      />
                      <span>Đường Dẫn Ảnh Online (URL)</span>
                    </label>
                  </div>

                  {/* Upload option display */}
                  {imageUrlOption === "upload" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-stone-50 border border-stone-300 hover:bg-stone-100 rounded-sm text-xs font-semibold text-stone-700 transition-colors flex items-center gap-1.5"
                        >
                          <Camera size={14} />
                          Chọn Tệp Tin Ảnh...
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        {uploadedBase64 ? (
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <Check size={14} /> Tệp ảnh hợp lệ
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">Hỗ trợ ảnh lên tới 15MB (Tự động nén tối ưu)</span>
                        )}
                      </div>
                      
                      {uploadedBase64 && (
                        <div className="mt-2 w-20 h-20 rounded-sm overflow-hidden border border-stone-200 bg-stone-50">
                          <img
                            src={uploadedBase64}
                            alt="Bản xem trước"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Online link URL input */}
                  {imageUrlOption === "url" && (
                    <div>
                      <input
                        type="url"
                        placeholder="Dán đường dẫn định dạng HTTPS (VD: https://domain.local/image.jpg)"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        className="w-full px-3.5 py-2 border border-stone-250 rounded-sm text-xs focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                      />
                    </div>
                  )}

                </div>

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 font-sans">
                  <button
                    type="button"
                    onClick={handleCloseClassmateForm}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Check size={16} />
                    {editingClassmateId ? "Cập Nhật Kỷ Yếu" : "Ghi Danh Kỷ Yếu"}
                  </button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL TẠO / SỬA ALBUM */}
      <AnimatePresence>
        {isAlbumFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAlbumFormOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-md w-full p-6 md:p-8 relative z-10 text-[#5A5A40]"
            >
              <button
                onClick={() => setIsAlbumFormOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#5A5A40]">
                {editingAlbumId ? <Edit3 size={24} /> : <FolderPlus size={24} />}
                <h2 className="text-xl font-normal tracking-wide text-[#5a5a40]">
                  {editingAlbumId ? "Chỉnh Sửa Album Kỷ Niệm" : "Tạo Album Kỷ Niệm Mới"}
                </h2>
              </div>
              
              <p className="text-xs text-stone-500 mb-6 leading-relaxed font-sans font-light">
                {editingAlbumId 
                  ? "Cập nhật lại tên gọi hoặc dòng giới thiệu để album thể hiện đúng nội dung chủ đề lưu bút lớp mình."
                  : "Tạo một ngăn danh mục lưu trữ để gom các bức ảnh chụp chung, dã ngoại hoặc các hoạt động theo từng chủ đề ý nghĩa."}
              </p>

              <form onSubmit={handleAddAlbumSubmit} className="space-y-4 font-sans font-light text-[#5a5a40]">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">
                    Tên Album <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 🏕️ Cắm trại Ba Vì (1995)"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">
                    Mô Tả / Giới Thiệu
                  </label>
                  <textarea
                    rows={3}
                    placeholder="VD: Lưu giữ các bức ảnh của đợt leo núi dã ngoại Ba Vì đầy nắng gió..."
                    value={newAlbumDesc}
                    onChange={(e) => setNewAlbumDesc(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200/40 font-sans">
                  <button
                    type="button"
                    onClick={() => setIsAlbumFormOpen(false)}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} />
                    {editingAlbumId ? "Lưu Thay Đổi" : "Tạo Album Ngay"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL ĐĂNG ẢNH TẬP THỂ */}
      <AnimatePresence>
        {isColFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseColForm}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="add-collective-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-2xl w-full p-6 md:p-8 relative z-10 overflow-y-auto max-h-[90vh] text-[#5A5A40]"
            >
              <button
                onClick={handleCloseColForm}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#5A5A40]">
                {editingColPhotoId ? <Edit3 size={24} /> : <Users size={24} />}
                <h2 className="text-xl md:text-2xl font-normal tracking-wide">
                  {editingColPhotoId ? "Cập Nhật Ảnh Tập Thể Lớp" : "Đăng Tải Ảnh Tập Thể Lớp"}
                </h2>
              </div>
              
              <p className="text-xs text-stone-500 mb-6 leading-relaxed font-sans font-light">
                Cùng lưu giữ những hình ảnh tinh nghịch thời học sinh hoặc các chuyến dã ngoại của lớp chúng mình.
              </p>

              <form onSubmit={handleAddColSubmit} className="space-y-5 font-sans font-light">
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Tiêu Đề Bức Ảnh <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Hội trại xuân 1996 mộng mơ"
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide">
                        Thời gian / Ngày kỷ niệm
                      </label>
                      <div className="flex gap-1 bg-stone-200/50 p-0.5 rounded-sm select-none">
                        <button
                          type="button"
                          onClick={() => {
                            setColDateMode("calendar");
                            const iso = vietnameseToIsoDate(newColDate);
                            if (iso) {
                              setNewColDate(isoToVietnameseDate(iso));
                            } else {
                              setNewColDate("");
                            }
                          }}
                          className={`px-2 py-0.5 text-[9px] uppercase font-sans font-bold rounded-xs transition-all cursor-pointer ${
                            colDateMode === "calendar"
                              ? "bg-white text-[#5A5A40] shadow-xs"
                              : "text-stone-500 hover:text-stone-700"
                          }`}
                        >
                          📅 Lịch
                        </button>
                        <button
                          type="button"
                          onClick={() => setColDateMode("custom")}
                          className={`px-2 py-0.5 text-[9px] uppercase font-sans font-bold rounded-xs transition-all cursor-pointer ${
                            colDateMode === "custom"
                              ? "bg-white text-[#5A5A40] shadow-xs"
                              : "text-stone-500 hover:text-stone-700"
                          }`}
                        >
                          ✍️ Nhập tay
                        </button>
                      </div>
                    </div>

                    {colDateMode === "calendar" ? (
                      <div className="relative flex items-center">
                        <input
                          type="date"
                          value={vietnameseToIsoDate(newColDate)}
                          onChange={(e) => {
                            const isoVal = e.target.value;
                            setNewColDate(isoToVietnameseDate(isoVal));
                          }}
                          className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all font-sans cursor-pointer"
                        />
                        {newColDate && (
                          <div className="absolute right-10 pointer-events-none bg-stone-100 border border-stone-200 rounded-sm px-2 py-0.5 text-[10px] text-stone-600 font-sans font-medium hidden xs:block">
                            {newColDate}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="VD: Mùa hè 1996 hoặc Tháng 5/1996"
                        value={newColDate}
                        onChange={(e) => setNewColDate(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                      Nguồn Hình Ảnh
                    </label>
                    {directUploadAlbumId ? (
                      <div className="text-xs p-2.5 bg-stone-100 border border-stone-250 rounded-sm text-stone-600 font-medium font-sans">
                        📥 Tải ảnh trực tiếp từ thiết bị của bạn
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewColUrlChoice("upload")}
                          className={`text-xs p-2 rounded-sm border font-medium transition-all cursor-pointer ${
                            newColUrlChoice === "upload"
                              ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                              : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          Tải ảnh lên
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewColUrlChoice("url")}
                          className={`text-xs p-2 rounded-sm border font-medium transition-all cursor-pointer ${
                            newColUrlChoice === "url"
                              ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                              : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          Đường dẫn và URL
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {newColUrlChoice === "url" && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="block text-xs font-semibold text-stone-600">Liên kết ảnh chất lượng cao (URL)</label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/... hoặc link ảnh bất kỳ"
                      value={newColUrl}
                      onChange={(e) => setNewColUrl(e.target.value)}
                      className="w-full px-3.5 py-1.5 bg-white border border-stone-250 rounded-sm text-xs focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none"
                    />
                  </div>
                )}

                {newColUrlChoice === "upload" && (
                  <div className="space-y-2.5 animate-fadeIn">
                    <div
                      onClick={() => uploadColRef.current?.click()}
                      className="border-2 border-dashed border-[#E5E0C0] hover:border-[#5A5A40] bg-white rounded-sm p-5 text-center cursor-pointer transition-all hover:bg-stone-50/50 flex flex-col items-center justify-center gap-1.5 group"
                    >
                      <input
                        type="file"
                        ref={uploadColRef}
                        accept="image/*"
                        onChange={handleColFileUpload}
                        className="hidden"
                      />
                      <Camera size={26} className="text-stone-400 group-hover:text-[#5A5A40] transition-colors" />
                      <span className="text-xs font-medium text-stone-700">Kéo thả hoặc Click để chọn ảnh từ máy</span>
                      <span className="text-[10px] text-stone-400">Định dạng file ảnh chất lượng cao (.jpg, .png), hỗ trợ ảnh tới 15MB. Hệ thống sẽ tự động tối ưu hóa dung lượng.</span>
                    </div>

                    {newColUpload && (
                      <div className="flex items-center justify-center py-2">
                        <div className="bg-white p-2 pb-6 border border-stone-200 shadow-md max-w-[200px] text-center rotate-2">
                          <img src={newColUpload} alt="Preview" className="w-[180px] h-[120px] object-cover mb-1 border" />
                          <span className="text-[10px] font-serif italic text-stone-400">Xem trước ảnh tập thể lớp</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Album Lưu Trữ
                  </label>
                  {directUploadAlbumId ? (
                    <div className="w-full px-3.5 py-2.5 bg-stone-100 border border-stone-250 rounded-sm text-stone-700 font-medium text-sm flex items-center gap-1.5 shadow-xs">
                      📁 <span className="font-semibold text-[#5A5A40]">{collectiveAlbums.find(a => a.id === directUploadAlbumId)?.name || "Chung"}</span>
                    </div>
                  ) : (
                    <select
                      value={newColAlbumId}
                      onChange={(e) => setNewColAlbumId(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="">-- Thuộc Album (Chung / Không phân loại) --</option>
                      {collectiveAlbums.map((album) => (
                        <option key={album.id} value={album.id}>
                          📁 {album.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Mô tả / Kể lại kỉ niệm bức ảnh <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="VD: Buổi múa sạp hôm đó vui ơi là vui, cả đám tụ lại ca hát rồi chụp chung bức hình lưu dấu..."
                    value={newColDesc}
                    onChange={(e) => setNewColDesc(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 font-sans">
                  <button
                    type="button"
                    onClick={handleCloseColForm}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Check size={16} />
                    {editingColPhotoId ? "Cập Nhật Ảnh" : "Đăng Lên Bảng Kỷ Niệm"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* MODAL ĐĂNG CỔ VẬT / KỶ VẬT KIỂU CŨ */}
      <AnimatePresence>
        {isMemFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseMemForm}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="add-memory-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-2xl w-full p-6 md:p-8 relative z-10 overflow-y-auto max-h-[90vh] text-[#5A5A40]"
            >
              <button
                onClick={handleCloseMemForm}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#5A5A40]">
                {editingMemPhotoId ? <Edit3 size={24} /> : <Camera size={24} />}
                <h2 className="text-xl md:text-2xl font-normal tracking-wide">
                  {editingMemPhotoId ? "Cập Nhật Kỷ Vật Niên Khóa" : "Lưu Gửi Kỷ Vật Niên Khóa"}
                </h2>
              </div>
              
              <p className="text-xs text-stone-500 mb-6 leading-relaxed font-sans font-light">
                Cùng ký thác lại những hiện vật, cổ vật xưa gắn liền với lớp học như cuốn tập viết, nhành hoa phượng ép, bút máy hay áo đồng phục lớp đầy chữ ký.
              </p>

              <form onSubmit={handleAddMemSubmit} className="space-y-5 font-sans font-light">
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Tên Hiện Vật / Kỷ Vật <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Chiếc Radio casette hiệu Sharp đỏ"
                    value={newMemTitle}
                    onChange={(e) => setNewMemTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Hình thức Đăng Ảnh Cổ Vật
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewMemUrlChoice("preset")}
                      className={`text-xs p-2 rounded-sm border font-medium transition-all ${
                        newMemUrlChoice === "preset"
                          ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                          : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      Ảnh Kỷ Vật Mẫu
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMemUrlChoice("upload")}
                      className={`text-xs p-2 rounded-sm border font-medium transition-all ${
                        newMemUrlChoice === "upload"
                          ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                          : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      Tải ảnh hiện vật lên
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMemUrlChoice("url")}
                      className={`text-xs p-2 rounded-sm border font-medium transition-all ${
                        newMemUrlChoice === "url"
                          ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                          : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      Nhập đường dẫn URL
                    </button>
                  </div>
                </div>

                {/* Presets conditional list */}
                {newMemUrlChoice === "preset" && (
                  <div className="p-3 bg-[#FEF9E7]/40 border border-dashed border-[#E5E0C0] rounded-sm">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
                      Chọn ảnh kỷ vật cổ điển đầy cảm xúc học trò:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {PRESET_MEMORIES.map((item) => {
                        const isSelected = newMemPreset === item.url;
                        return (
                          <div
                            key={item.name}
                            onClick={() => setNewMemPreset(item.url)}
                            className={`aspect-square cursor-pointer relative rounded-sm overflow-hidden border-2 transition-all ${
                              isSelected ? "border-[#5A5A40] scale-95 shadow-md" : "border-transparent opacity-70 hover:opacity-100"
                            }`}
                            title={item.name}
                          >
                            <img src={item.url} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 px-1 text-[8px] text-white text-center truncate">
                              {item.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {newMemUrlChoice === "url" && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-stone-600">Đường dẫn hình ảnh kỷ vật</label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/... hoặc liên kết ảnh kỷ vật khác"
                      value={newMemUrl}
                      onChange={(e) => setNewMemUrl(e.target.value)}
                      className="w-full px-3.5 py-1.5 bg-white border border-stone-250 rounded-sm text-xs focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none"
                    />
                  </div>
                )}

                {newMemUrlChoice === "upload" && (
                  <div className="space-y-2.5">
                    <div
                      onClick={() => uploadMemRef.current?.click()}
                      className="border-2 border-dashed border-[#E5E0C0] hover:border-[#5A5A40] bg-white rounded-sm p-5 text-center cursor-pointer transition-all hover:bg-stone-50/50 flex flex-col items-center justify-center gap-1.5 group"
                    >
                      <input
                        type="file"
                        ref={uploadMemRef}
                        accept="image/*"
                        onChange={handleMemFileUpload}
                        className="hidden"
                      />
                      <Camera size={26} className="text-stone-400 group-hover:text-[#5A5A40] transition-colors" />
                      <span className="text-xs font-medium text-stone-700">Kéo thả hoặc Click để tải ảnh kỷ vật</span>
                      <span className="text-[10px] text-stone-400">File ảnh chân thực từ máy cá nhân của bạn, giữ nguyên cảm xúc hoài vọng.</span>
                    </div>

                    {newMemUpload && (
                      <div className="flex items-center justify-center py-2">
                        <div className="bg-white p-3 border border-stone-200 shadow-lg max-w-[150px] rotate-[-2deg]">
                          <img src={newMemUpload} alt="Preview kỉ vật" className="w-[130px] h-[130px] object-cover mb-1 border" />
                          <div className="text-[9px] font-serif text-center text-stone-400">Xem trước kỷ vật</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Câu chuyện / Hồi ức kỳ thú của kỷ vật này <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="VD: Cuốn bút ký này cả lớp chuyền tay nhau viết suốt năm học lớp 12, nét mực phai dần nhưng lời hẹn ước năm xưa vẫn vẹn nguyên..."
                    value={newMemDesc}
                    onChange={(e) => setNewMemDesc(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-stone-250 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 font-sans">
                  <button
                    type="button"
                    onClick={handleCloseMemForm}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Check size={16} />
                    {editingMemPhotoId ? "Cập Nhật Kỷ Vật" : "Ký Thác Kỷ Vật Cổ"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL ĐĂNG HOẠT VIDEO PHÁT PHÁP */}
      <AnimatePresence>
        {isVidFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseVidForm}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="add-video-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-xl w-full p-6 md:p-8 relative z-10 text-[#5A5A40]"
            >
              <button
                onClick={handleCloseVidForm}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#5A5A40]">
                {editingVideoId ? <Edit3 size={24} /> : <Video size={24} />}
                <h2 className="text-xl md:text-2xl font-normal tracking-wide">
                  {editingVideoId ? "Cập Nhật Video Hoài Niệm" : "Đăng Tải Video Hoài Niệm"}
                </h2>
              </div>
              
              <p className="text-xs text-stone-500 mb-6 leading-relaxed font-sans font-light">
                Chia sẻ liên kết video văn nghệ trường xưa, ngày tựu trường hay thước phim hành lang ấm áp của lớp học qua nền tảng YouTube hoặc các nguồn phát video.
              </p>

              <form onSubmit={handleAddVidSubmit} className="space-y-4 font-sans font-light">
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Tiêu Đề Thước Phim Kỷ Niệm <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Văn nghệ chào mừng 20/11 đầy xúc cảm"
                    value={newVidTitle}
                    onChange={(e) => setNewVidTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Đường Dẫn Video (Hỗ trợ YouTube) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="VD: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    value={newVidUrl}
                    onChange={(e) => setNewVidUrl(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                  <span className="block text-[10px] text-stone-400 mt-1 font-sans">
                    * Định dạng URL tốt nhất: Link xem phim trực tiếp trên Youtube (youtube.com/watch?v=... hoặc youtu.be/...)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Lời tựa / Hồi ức đi kèm thước phim <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="VD: Thước phim lấm lem ghi lại cảnh tập kịch đầy tiếng cười giòn tan của cả nhóm..."
                    value={newVidDesc}
                    onChange={(e) => setNewVidDesc(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 font-sans">
                  <button
                    type="button"
                    onClick={handleCloseVidForm}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Check size={16} />
                    {editingVideoId ? "Cập Nhật Video" : "Phát Hành Video Lên Bảng"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL GỬI LƯU BÚT TÂM SỰ MỚI */}
      <AnimatePresence>
        {isGuestbookFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseGuestbookForm}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="add-guestbook-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-xl w-full p-6 md:p-8 relative z-10 text-[#5A5A40]"
            >
              <button
                onClick={handleCloseGuestbookForm}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
                title="Đóng cửa sổ"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#5A5A40]">
                {editingGuestbookId ? <Edit3 size={24} /> : <BookOpen size={24} />}
                <h2 className="text-xl md:text-2xl font-normal tracking-wide">
                  {editingGuestbookId ? "Sửa Lời Lưu Bút" : "Gửi Lưu Bút / Thư Ký Sự"}
                </h2>
              </div>
              
              <p className="text-xs text-stone-500 mb-6 leading-relaxed font-sans font-light">
                Hãy viết những dòng hoài niệm mộc mạc nhất về mái trường, thầy cô hay gửi ngàn lời chúc bình an đầy trân quý tới gia đình lớn 12A thân thương nhé!
              </p>

              <form onSubmit={handleAddGuestbookSubmit} className="space-y-4 font-sans font-light">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                      Tên Người Viết / Gửi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Đào Duy Anh"
                      value={newGuestbookSender}
                      onChange={(e) => setNewGuestbookSender(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide">
                        Thời Điểm / Ngày Ký <span className="text-stone-400">(Tùy chọn)</span>
                      </label>
                      <div className="flex gap-1 bg-stone-200/50 p-0.5 rounded-sm select-none">
                        <button
                          type="button"
                          onClick={() => {
                            setGuestbookDateMode("calendar");
                            const iso = vietnameseToIsoDate(newGuestbookDate);
                            if (iso) {
                              setNewGuestbookDate(isoToVietnameseDate(iso));
                            } else {
                              setNewGuestbookDate("");
                            }
                          }}
                          className={`px-2 py-0.5 text-[9px] uppercase font-sans font-bold rounded-xs transition-all cursor-pointer ${
                            guestbookDateMode === "calendar"
                              ? "bg-white text-[#5A5A40] shadow-xs"
                              : "text-stone-500 hover:text-stone-700"
                          }`}
                        >
                          📅 Lịch
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuestbookDateMode("custom")}
                          className={`px-2 py-0.5 text-[9px] uppercase font-sans font-bold rounded-xs transition-all cursor-pointer ${
                            guestbookDateMode === "custom"
                              ? "bg-white text-[#5A5A40] shadow-xs"
                              : "text-stone-500 hover:text-stone-700"
                          }`}
                        >
                          ✍️ Nhập tay
                        </button>
                      </div>
                    </div>

                    {guestbookDateMode === "calendar" ? (
                      <div className="relative flex items-center">
                        <input
                          type="date"
                          value={vietnameseToIsoDate(newGuestbookDate)}
                          onChange={(e) => {
                            const isoVal = e.target.value;
                            setNewGuestbookDate(isoToVietnameseDate(isoVal));
                          }}
                          className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all font-sans cursor-pointer"
                        />
                        {newGuestbookDate && (
                          <div className="absolute right-10 pointer-events-none bg-stone-100 border border-stone-200 rounded-sm px-2 py-0.5 text-[10px] text-stone-600 font-sans font-medium hidden xs:block">
                            {newGuestbookDate}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder={`VD: ${new Date().toLocaleDateString("vi-VN")}`}
                        value={newGuestbookDate}
                        onChange={(e) => setNewGuestbookDate(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Tiêu Đề Bức Thư Tâm Sự <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Gửi lớp mình niên khóa 1993 - 1996 thân yêu!"
                    value={newGuestbookTitle}
                    onChange={(e) => setNewGuestbookTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Nội Dung Lưu Bút / Tâm Sự <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={6}
                    placeholder="Hãy viết ra những tình cảm ấm áp nhất dành cho tập thể lớp mình ở đây nhé..."
                    value={newGuestbookContent}
                    onChange={(e) => setNewGuestbookContent(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all"
                  />
                </div>

                {/* Background color selection preset */}
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-2">
                    Phong Cách / Màu Sắc Trình Bày
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {[
                      { id: "yellow", label: "Vàng Cổ Điển", dot: "bg-[#FEF5D1] border-[#D1C68E]" },
                      { id: "green", label: "Xanh Ký Sự", dot: "bg-[#D9EED9] border-[#A8CCA8]" },
                      { id: "pink", label: "Hồng Tâm Sự", dot: "bg-[#FADBD8] border-[#E0A8A8]" },
                      { id: "blue", label: "Xanh Nhật Ký", dot: "bg-[#D6EAF8] border-[#A2C4E0]" },
                    ].map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setNewGuestbookBgStyle(style.id)}
                        className={`px-3 py-1.5 rounded-sm border text-xs font-sans font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                          newGuestbookBgStyle === style.id
                            ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                            : "bg-white text-stone-600 border-stone-200 hover:border-[#DCD5B0]"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border ${style.dot}`} />
                        <span>{style.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 font-sans">
                  <button
                    type="button"
                    onClick={handleCloseGuestbookForm}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Check size={16} />
                    {editingGuestbookId ? "Cập Nhật" : "Gửi Lên Trang Lưu Bút"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================== MODAL ĐĂNG NHẬP BAN CÁN SỰ / ADMIN ===================== */}
      <AnimatePresence>
        {isLoginModalOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsLoginModalOpen(false);
                setLoginError("");
                setAdminPassword("");
              }}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="admin-login-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-sm w-full p-6 md:p-8 relative z-10 text-[#5A5A40] text-center"
            >
              <button
                onClick={() => {
                  setIsLoginModalOpen(false);
                  setLoginError("");
                  setAdminPassword("");
                }}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center mb-6">
                <div className="w-12 h-12 bg-[#FEF9E7] rounded-full flex items-center justify-center text-[#5A5A40] mb-3 border border-[#E5E0C0]">
                  <Lock size={20} />
                </div>
                <h2 className="text-lg font-medium tracking-wide">Xác Minh Thành Viên Lớp</h2>
                <p className="text-xs text-stone-500 mt-1 font-sans font-light">
                  Đăng nhập để có quyền thêm bạn học, xoá các tấm thẻ, đăng ảnh tập thể và gửi tệp đa phương tiện của lớp 12A.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4 text-left font-sans font-light">
                <div>
                  <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wide mb-1.5">
                    Mật Khẩu Thành Viên
                  </label>
                  <input
                    id="admin-password-input"
                    type="password"
                    required
                    placeholder="Nhập mật khẩu kiểm duyệt..."
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#DCD5B0]/80 rounded-sm text-sm focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] focus:outline-none transition-all text-center tracking-widest font-bold"
                    autoFocus
                  />
                </div>

                {loginError && (
                  <p className="text-xs text-rose-500 bg-rose-50/50 p-2 rounded-sm border border-rose-100/40 text-center">
                    {loginError}
                  </p>
                )}

                {/* Submits */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginModalOpen(false);
                      setLoginError("");
                      setAdminPassword("");
                    }}
                    className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-sm text-xs font-semibold text-stone-700 transition-colors flex-1 text-center justify-center flex"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-sm text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 flex-1"
                  >
                    Đăng Nhập
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================== MODAL SAO LƯU & KHÔI PHỤC DỮ LIỆU ===================== */}
      <AnimatePresence>
        {isBackupModalOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBackupModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              id="backup-restore-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-xl border border-stone-200 max-w-lg w-full p-6 md:p-8 relative z-10 text-[#5A5A40]"
            >
              <button
                onClick={() => setIsBackupModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-sm text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6 border-b border-stone-200/80 pb-4">
                <div className="w-10 h-10 bg-[#FEF9E7] rounded-full flex items-center justify-center text-[#5A5A40] border border-[#E5E0C0] shrink-0">
                  <Database size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-medium tracking-wide">Sao Lưu & Khôi Phục Dữ Liệu</h2>
                  <p className="text-xs text-stone-500 font-sans font-light mt-0.5">
                    Quản lý bộ nhớ lưu giữ kỷ niệm lớp học
                  </p>
                </div>
              </div>

              {/* Status Section */}
              <div className="bg-white p-4 border border-stone-200/80 rounded mb-6 font-sans">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Trạng Thái Kết Nối</h4>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Phương thức lưu trữ hoạt động:</span>
                  <span className={`text-sm font-bold flex items-center gap-1.5 ${dbMode === "cloud" ? "text-emerald-600" : "text-amber-600"}`}>
                    <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse inline-block" />
                    {dbMode === "cloud" ? "Ổ mây (Cloud Firestore)" : "Bộ nhớ trình duyệt (Ngoại tuyến)"}
                  </span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed font-light">
                  {dbMode === "cloud" ? (
                    "Mọi thay đổi của lớp học đang được đồng bộ trực tuyến với cơ sớ dữ liệu Firestore của Google. Mỗi ngày bạn có tối đa 50k lượt đọc miễn phí trên toàn bộ hệ thống lớp học."
                  ) : isQuotaExceeded ? (
                    "MÁY CHỦ HẾT HẠN NGẠCH NGÀY CHẠY MẪU: Đám mây Firestore miễn phí của dự án tạm thời đã dùng hết 50k lượt của ngày hôm nay. Hệ thống đã tự động kích hoạt Lưu trữ Trình duyệt. Bạn có thể tự do chỉnh sửa, lưu trữ kỷ niệm tại trình duyệt của riêng mình mà không gặp bất kỳ lỗi gì!"
                  ) : (
                    "Dữ liệu đang được lưu cục bộ trên trình duyệt máy này. Mọi hành động thêm thành viên, chỉnh sửa ảnh kỷ vật hoặc phản hồi sẽ lưu cực kỳ an toàn ở đây của bạn."
                  )}
                </p>
              </div>

              {/* Action grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans mb-4">
                {/* Export Column */}
                <div className="border border-stone-200/60 p-4 bg-[#FAF9F5] rounded flex flex-col items-center text-center">
                  <Download size={24} className="text-stone-500 mb-2" />
                  <h3 className="text-sm font-semibold text-stone-700 mb-1">Tải Bản Sao Lưu (.json)</h3>
                  <p className="text-[11px] text-stone-500 mb-4 font-light">
                    Tải toàn bộ Profile học sinh, bình luận lưu bút và Album ảnh về máy tính để bảo quản vĩnh viễn dữ liệu.
                  </p>
                  <button
                    onClick={handleExportBackup}
                    className="mt-auto w-full px-4 py-2 bg-[#5A5A40] text-white hover:bg-[#4A4A30] text-xs font-bold rounded-sm transition-all shadow-sm cursor-pointer"
                  >
                    Tải Bản Sao Lưu Ngay
                  </button>
                </div>

                {/* Import Column */}
                <div className="border border-stone-200/60 p-4 bg-[#FAF9F5] rounded flex flex-col items-center text-center relative">
                  <Upload size={24} className="text-stone-500 mb-2" />
                  <h3 className="text-sm font-semibold text-stone-700 mb-1">Nhập Lại Bản Sao (.json)</h3>
                  <p className="text-[11px] text-stone-500 mb-4 font-light">
                    Ghi đè hoặc khôi phục dữ liệu kỷ yếu lớp từ một file sao lưu .json đã lưu trước đó trên thiết bị.
                  </p>
                  <label className="mt-auto w-full px-4 py-2 border border-[#5A5A40] text-[#5A5A40] hover:bg-stone-50 text-xs font-bold rounded-sm text-center block cursor-pointer transition-all">
                    Chọn File Khôi Phục
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportBackup}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* DB Manual Switch */}
              <div className="border-t border-stone-200/80 pt-4 font-sans text-center flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-stone-500">
                  Muốn chuyển đổi thủ công để lưu kết nối?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (dbMode === "cloud") {
                      setDbMode("local");
                      localStorage.setItem("ky-yeu-db-mode", "local");
                      loadAllLocalData();
                    } else {
                      setDbMode("cloud");
                      localStorage.setItem("ky-yeu-db-mode", "cloud");
                      window.location.reload();
                    }
                  }}
                  className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 rounded text-xs font-semibold cursor-pointer transition-all"
                >
                  Chuyển sang lưu trữ {dbMode === "cloud" ? "Trình duyệt (Local)" : "Máy chủ đám mây"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. NOSTALGIC CLASS ROOM MEMORIES DECORATION WRAPPER */}
      <section className="max-w-5xl mx-auto px-4 mt-20">
        <div className="bg-[#5A5A40] rounded-sm p-6 md:p-8 text-[#F5F5F0] relative overflow-hidden shadow-md border border-[#4A4A30]">
          
          {/* Subtle organic dotted background feel */}
          <div className="absolute inset-0 bg-[radial-gradient(#4d4d36_1px,transparent_1px)] [background-size:20px_20px] opacity-35"></div>
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            
            <div className="md:col-span-2 space-y-4">
              <span className="px-2.5 py-1 rounded bg-[#4A4A30] border border-[#3E3E28] text-[#E5E0C0] text-[10px] font-sans font-bold uppercase tracking-wider">
                Bảng Tin Học Đường Lớp 12A
              </span>
              <h3 className="text-2xl md:text-3xl font-light tracking-wide">
                Hồi Ức Hành Lang & Góc Sân Trường
              </h3>
              <p className="text-sm text-stone-200 leading-relaxed max-w-xl font-sans font-light">
                Ba mươi năm – một quãng thời gian đủ dài để tóc xanh điểm bạc, để cuộc sống đưa mỗi người đến những chân trời khác nhau. Nhưng có một điều chưa bao giờ thay đổi, đó là ký ức về những năm tháng học trò dưới mái trường Chương Mỹ B. Nơi ấy có những người bạn thân thương, những người thầy đáng kính, những ước mơ trong trẻo và những kỷ niệm không thể nào quên. Hôm nay, chúng ta trở về để gặp lại nhau, gặp lại tuổi trẻ của chính mình và cùng viết tiếp câu chuyện đẹp của tình bạn sau ba mươi năm.
              </p>
              
              <div className="grid grid-cols-2 gap-4 max-w-md pt-2 font-sans">
                <div className="bg-[#4a4a30]/60 rounded-sm p-3 border border-[#3A3A28]/40">
                  <span className="block text-xs text-[#E5E0C0] font-light">Trò đùa thân quen</span>
                  <span className="font-bold text-sm text-white">Giấu cặp, giấu dép & Buộc tà áo</span>
                </div>
                <div className="bg-[#4a4a30]/60 rounded-sm p-3 border border-[#3A3A28]/40">
                  <span className="block text-xs text-[#E5E0C0] font-light">Môn học thăng trầm nhất</span>
                  <span className="font-bold text-sm text-white">Tích phân & Đạo hàm lý thuyết</span>
                </div>
              </div>
            </div>

            <div className="bg-[#4A4A30]/60 backdrop-blur-sm rounded-sm p-5 border border-[#3A3A28]/50 space-y-4 font-sans text-stone-200">
              <h4 className="font-bold text-sm text-[#E5E0C0] uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={14} className="text-[#E5E0C0]" /> Hướng Dẫn Thao Tác
              </h4>
              <ul className="text-xs space-y-2.5 leading-relaxed list-disc list-inside font-light">
                <li><strong className="text-white">Nhấp chuột trực tiếp</strong> vào ảnh chân dung để lật xem lưu bút cá nhân.</li>
                <li>Tìm kiếm bạn học bằng tên gọi hoặc phân lọc theo Tổ Ban.</li>
                <li>Hỗ trợ tải lên ảnh tự chế chân thực và lưu giữ an toàn trên thiết bị cá nhân.</li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* Dynamic Board Info */}
      <div className="max-w-4xl mx-auto px-4 mb-8">
        <div className="flex flex-wrap justify-center items-center gap-3 text-xs md:text-sm text-stone-600 bg-white p-4 shadow-sm rounded-sm border border-stone-200">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F9F7F2] rounded text-stone-700 font-sans">
            <BookOpen size={15} className="text-[#5A5A40]" />
            <span>Sĩ số: <strong className="text-stone-900 font-semibold">41</strong> thành viên</span>
          </div>
          <div className="h-4 w-[1px] bg-stone-200 hidden sm:block"></div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FEF9E7] rounded text-stone-700 font-sans">
            <Heart size={15} className="text-rose-500 fill-rose-500" />
            <span>Mỗi tấm thẻ ẩn giấu lời lưu bút chân tình</span>
          </div>
          <div className="h-4 w-[1px] bg-stone-200 hidden sm:block"></div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#E8F3E8] text-[#405A40] font-sans font-medium rounded border border-[#C8DBC8]/40">
            <Clock size={15} className="text-[#405A40]" />
            <span>{new Date().toLocaleDateString("vi-VN")}</span>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="max-w-5xl mx-auto px-4 mt-20 text-center text-xs text-stone-500 font-sans">
        <div className="h-[1px] bg-stone-200 mb-6"></div>
        <p className="flex items-center justify-center gap-1.5 font-light">
          <span>Kỷ Yếu Niên Khóa 12A mến thương • Thiết kế theo phong cách</span>
          <span className="font-medium text-[#5A5A40]">Natural Tones</span>
          <Heart size={12} className="text-rose-500/80 fill-rose-500/30" />
        </p>
        <p className="mt-1 text-[10px] text-stone-400 font-light">
          Được vận hành an toàn và mượt mà trên hạ tầng AI Studio Build.
        </p>
      </footer>

      {/* ===================== LIGHTBOX MODAL ===================== */}
      <AnimatePresence>
        {lightboxPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxPhoto(null)}
              className="absolute inset-0 bg-stone-950/85 backdrop-blur-md"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#F9F7F2] rounded-sm shadow-2xl border border-stone-300/30 max-w-5xl w-full p-3 md:p-4 relative z-10 overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                <button
                  onClick={() => handleDownloadPhoto(lightboxPhoto.url, lightboxPhoto.title)}
                  className="p-2 bg-stone-900/80 hover:bg-stone-900 text-white hover:text-stone-100 rounded-full transition-all cursor-pointer shadow-md"
                  title="Tải ảnh này về máy"
                >
                  <Download size={20} />
                </button>
                <button
                  onClick={() => setLightboxPhoto(null)}
                  className="p-2 bg-stone-900/80 hover:bg-stone-900 text-white hover:text-stone-100 rounded-full transition-all cursor-pointer shadow-md"
                  title="Đóng xem ảnh"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="w-full flex-1 overflow-auto flex items-center justify-center bg-stone-900/95 rounded-sm p-2 border border-stone-800">
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.title}
                  className="max-h-[70vh] md:max-h-[75vh] w-auto max-w-full object-contain rounded-sm shadow-inner"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="p-3 md:p-4 text-[#5A5A40] text-center font-serif mt-2 border-t border-stone-200/50">
                <h3 className="text-lg md:text-xl font-medium tracking-tight">
                  {lightboxPhoto.title}
                </h3>
                {lightboxPhoto.description && (
                  <p className="text-xs text-stone-600 font-sans font-light mt-1.5 max-w-2xl mx-auto leading-relaxed">
                    {lightboxPhoto.description}
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================== CUSTOM CONFIRM MODAL ===================== */}
      <AnimatePresence>
        {confirmTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmTarget(null)}
              className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#F9F7F2] border border-stone-300 rounded-sm shadow-2xl max-w-md w-full relative z-10 overflow-hidden"
            >
              {/* Notebook binding top style decoration */}
              <div className="h-1.5 bg-[#5A5A40]" />
              
              <div className="p-6">
                <div className="flex items-center gap-3 text-stone-850 mb-3.5">
                  <span className="p-2 bg-[#E8F3E8] rounded-full text-[#405A40]">
                    {confirmTarget.type === "restore" ? <Sparkles size={18} /> : <Trash2 size={18} />}
                  </span>
                  <h3 className="text-sm font-sans font-bold text-stone-800 uppercase tracking-wider">
                    {confirmTarget.title}
                  </h3>
                </div>

                <p className="text-xs text-stone-600 font-sans leading-relaxed mb-6 font-light">
                  {confirmTarget.message}
                </p>

                <div className="flex items-center justify-end gap-2 text-xs font-sans">
                  <button
                    onClick={() => setConfirmTarget(null)}
                    className="px-3 py-2 border border-stone-250 hover:bg-stone-50 text-stone-600 text-xs font-medium rounded-sm transition-all cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    onClick={handleConfirmAction}
                    className={`px-3 py-2 ${confirmTarget.type === "restore" ? "bg-[#5A5A40] hover:bg-[#4A4A30]" : "bg-rose-600 hover:bg-rose-700"} text-white font-medium rounded-sm shadow-sm transition-all cursor-pointer`}
                  >
                    {confirmTarget.type === "restore" ? "Khôi Phục Ngay" : "Đồng Ý Xóa"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================== FULLSCREEN CLASSMATE CARD ZOOM MODAL ===================== */}
      <AnimatePresence>
        {zoomedClassmate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoomedClassmate(null)}
              className="absolute inset-0 bg-stone-950/80 backdrop-blur-md"
            />

            {/* Modal Wrapper */}
            <div className="relative z-10 flex items-center justify-center w-full max-w-lg select-none px-4">
              
              {/* Large Card Container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 15 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="perspective-2000 w-[290px] sm:w-[370px] select-none text-left"
                style={{ height: "510px" }}
              >
                <div 
                  onClick={() => {
                    const nextFlippedState = !isZoomedFlipped;
                    setIsZoomedFlipped(nextFlippedState);
                    setFlippedCards((prev) => ({
                      ...prev,
                      [zoomedClassmate.student.id]: nextFlippedState
                    }));
                  }}
                  className={`w-full h-full relative preserve-3d flip-card-transition shadow-2xl rounded-sm ${
                    isZoomedFlipped ? "rotate-y-180" : ""
                  }`}
                >
                  
                  {/* FRONT SIDE */}
                  <div className="absolute inset-0 w-full h-full rounded-sm bg-white border border-stone-200 p-4 pb-6 flex flex-col justify-between backface-hidden overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="flex justify-between items-center text-xs text-stone-200 font-sans pb-1.5 pt-1">
                      <span className="px-2.5 py-0.5 bg-[#F9F7F2] text-[#5A5A40] border border-stone-250 rounded text-[9px] uppercase font-bold tracking-wider">
                        {zoomedClassmate.student.group}
                      </span>
                      <div className="w-16 h-4 bg-[#E5E0C0]/60 border border-dashed border-[#5A5A40]/10 shadow-sm rotate-1 -mt-6 absolute left-1/2 -translate-x-1/2 z-10" />
                      <span className="text-[#5A5A40] font-sans font-bold text-[9px] flex items-center gap-1 bg-[#E8F3E8] px-2 py-0.5 rounded">
                        🎓 12A
                      </span>
                    </div>

                    {/* Image */}
                    <div className="w-full flex-1 aspect-square relative overflow-hidden bg-[#F9F7F2] border border-stone-100 shadow-inner rounded-sm">
                      <img
                        src={zoomedClassmate.student.avatarUrl}
                        alt={zoomedClassmate.student.name}
                        referrerPolicy="no-referrer"
                        className={
                          vintageFilter === "sepia" ? "w-full h-full object-cover sepia brightness-90 contrast-[1.02] saturate-[1.12] transition-all duration-500" :
                          vintageFilter === "bw" ? "w-full h-full object-cover grayscale contrast-[1.25] brightness-[0.85] transition-all duration-500" :
                          vintageFilter === "warm" ? "w-full h-full object-cover sepia-[0.3] saturate-[1.4] brightness-[0.92] contrast-[0.98] transition-all duration-500" :
                          vintageFilter === "cool" ? "w-full h-full object-cover brightness-[0.93] contrast-[1.05] saturate-[0.8] hue-rotate-[-10deg] transition-all duration-500" :
                          vintageFilter === "grainy" ? "w-full h-full object-cover sepia-[0.12] contrast-[1.12] brightness-[0.92] saturate-[0.9] transition-all duration-500" :
                          "w-full h-full object-cover grayscale-[15%] transition-all duration-500"
                        }
                      />
                      {vintageFilter === "grainy" && (
                        <div 
                          className="absolute inset-0 pointer-events-none opacity-[0.16] mix-blend-overlay"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-black/5 opacity-0 hover:opacity-100 transition-all duration-300 flex items-end p-2 justify-center">
                        <span className="text-[10px] font-sans text-[#5A5A40] bg-white/95 px-2 py-1 shadow-md border border-stone-200/80 rounded-sm">
                          🔄 Click lật xem lưu bút
                        </span>
                      </div>
                    </div>

                    {/* Caption */}
                    <div className="mt-4 pt-3 border-t border-dashed border-stone-200 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <h3 className="font-serif text-[#5A5A40] text-xl font-medium tracking-tight truncate max-w-[80%]">
                          {zoomedClassmate.student.name}
                        </h3>
                        {zoomedClassmate.student.nickname && (
                          <span className="text-xs text-stone-400 italic max-w-[20%] truncate">
                            ({zoomedClassmate.student.nickname})
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-sans text-stone-500 tracking-wider uppercase mt-1">
                        {zoomedClassmate.student.role}
                      </p>
                    </div>

                    {/* Save photo option */}
                    <div className="absolute bottom-2 left-2 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadPhoto(zoomedClassmate.student.avatarUrl, zoomedClassmate.student.name);
                        }}
                        className="text-stone-500 hover:text-[#5A5A40] transition-all p-1.5 rounded-full hover:bg-stone-100/80 cursor-pointer font-sans border border-stone-200 bg-white flex items-center gap-1 shadow-sm px-2.5 py-1 text-[11px]"
                        title="Lưu ảnh chân dung về máy"
                      >
                        <Download size={13} />
                        <span>Lưu ảnh</span>
                      </button>
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClassmate(zoomedClassmate.student, e);
                            setZoomedClassmate(null);
                          }}
                          className="text-stone-400 hover:text-[#5A5A40] transition-all p-1 rounded-full hover:bg-stone-50 cursor-pointer"
                          title="Sửa thông tin"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClassmate(zoomedClassmate.student.id, e);
                            setZoomedClassmate(null);
                          }}
                          className="text-stone-400 hover:text-rose-600 transition-all p-1 rounded-full hover:bg-stone-50 cursor-pointer"
                          title="Xóa tấm thẻ này"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* BACK SIDE */}
                  <div className={`absolute inset-0 w-full h-full rounded-sm border ${
                    zoomedClassmate.index % 4 === 0 ? "border-[#E5E0C0] bg-[#FEF9E7]" :
                    zoomedClassmate.index % 4 === 1 ? "border-[#C8DBC8] bg-[#E8F3E8]" :
                    zoomedClassmate.index % 4 === 2 ? "border-[#ECD9D9] bg-[#FDF2F2]" :
                    "border-[#D6E2ED] bg-[#F0F4F8]"
                  } p-5 flex flex-col rotate-y-180 backface-hidden overflow-hidden shadow-inner`}>
                    
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px)] [background-size:100%_24px] opacity-70 z-0" />
                    
                    <div className="relative z-10 flex items-center justify-between pb-2 border-b border-stone-200/40">
                      <div className="flex items-center gap-1 font-sans">
                        <Heart size={13} className="text-rose-500 fill-rose-500" />
                        <span className={`text-[10px] font-bold tracking-wider ${
                          zoomedClassmate.index % 4 === 0 ? "text-[#5A5A40]" :
                          zoomedClassmate.index % 4 === 1 ? "text-[#405A40]" :
                          zoomedClassmate.index % 4 === 2 ? "text-[#6E4B4B]" :
                          "text-[#3D4F5E]"
                        }`}>TỔ LỚP: {zoomedClassmate.student.group}</span>
                      </div>
                      
                      <span className={`text-[9px] font-sans font-medium px-2 py-0.5 rounded-full ${
                        zoomedClassmate.index % 4 === 0 ? "bg-[#F5F0D0] text-[#5A5A40]" :
                        zoomedClassmate.index % 4 === 1 ? "bg-[#DBEADB] text-[#405A40]" :
                        zoomedClassmate.index % 4 === 2 ? "bg-[#F7E1E1] text-[#6E4B4B]" :
                        "bg-[#E0E9F2] text-[#3D4F5E]"
                      }`}>
                        Mảnh Ký Ức
                      </span>
                    </div>

                    <div className="relative z-10 flex-1 flex flex-col justify-between mt-3 font-serif">
                      <div>
                        <div className={`flex items-center gap-1 mb-1.5 ${
                          zoomedClassmate.index % 4 === 0 ? "text-[#5A5A40]" :
                          zoomedClassmate.index % 4 === 1 ? "text-[#405A40]" :
                          zoomedClassmate.index % 4 === 2 ? "text-[#6E4B4B]" :
                          "text-[#3D4F5E]"
                        }`}>
                          <BookOpen size={12} />
                          <span className="text-[10px] font-sans font-bold uppercase tracking-wider">Lưu Bút Viết Gửi:</span>
                        </div>

                        <blockquote className={`pl-1 text-xs italic leading-relaxed min-h-[110px] ${
                          zoomedClassmate.index % 4 === 0 ? "text-[#5A5A40]" :
                          zoomedClassmate.index % 4 === 1 ? "text-[#405A40]" :
                          zoomedClassmate.index % 4 === 2 ? "text-[#6E4B4B]" :
                          "text-[#3D4F5E]"
                        } opacity-90 select-all`}>
                          "{zoomedClassmate.student.quote}"
                        </blockquote>
                      </div>

                      {zoomedClassmate.student.funnyChat && (
                        <div className="mt-2 text-left">
                          <div className={`flex items-center gap-1 mb-1 ${
                            zoomedClassmate.index % 4 === 0 ? "text-[#5A5A40]" :
                            zoomedClassmate.index % 4 === 1 ? "text-[#405A40]" :
                            zoomedClassmate.index % 4 === 2 ? "text-[#6E4B4B]" :
                            "text-[#3D4F5E]"
                          }`}>
                            <MessageSquare size={12} />
                            <span className="text-[10px] font-sans font-bold uppercase tracking-wider">Góc Lội Nghịch Vui:</span>
                          </div>
                          
                          <div className={`rounded-sm p-2.5 text-[11px] border border-[#5a5a40]/10 leading-normal relative font-sans ${
                            zoomedClassmate.index % 4 === 0 ? "bg-[#F5F0D0] text-[#5A5A40]" :
                            zoomedClassmate.index % 4 === 1 ? "bg-[#DBEADB] text-[#405A40]" :
                            zoomedClassmate.index % 4 === 2 ? "bg-[#F7E1E1] text-[#6E4B4B]" :
                            "bg-[#E0E9F2] text-[#3D4F5E]"
                          }`}>
                            {zoomedClassmate.student.funnyChat}
                          </div>
                        </div>
                      )}

                      <div className="pt-2 text-center text-[10px] font-sans text-stone-400 font-medium pb-1.5 border-t border-stone-200/40 mt-2">
                        🔄 Click vào ảnh hoặc thẻ để lật lại mặt trước
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>

            </div>

            {/* Close Button */}
            <button
              onClick={() => setZoomedClassmate(null)}
              className="absolute top-4 right-4 sm:-top-12 sm:-right-12 p-2 bg-stone-900/80 hover:bg-stone-900 text-white hover:text-stone-100 rounded-full transition-all z-[60] cursor-pointer shadow-md"
              title="Đóng xem ảnh"
            >
              <X size={20} />
            </button>

          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
