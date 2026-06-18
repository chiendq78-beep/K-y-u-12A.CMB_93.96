import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Maximize2, 
  Download, 
  Calendar, 
  Sparkles, 
  Bookmark,
  Share2
} from "lucide-react";

interface Photo {
  id: string;
  title: string;
  description: string;
  url: string;
  date?: string;
  albumId?: string;
}

interface YearbookFlipbookProps {
  albumName: string;
  albumDesc?: string;
  photos: Photo[];
  onViewLarge: (photo: { url: string; title: string; description: string }) => void;
  onDownload: (url: string, title: string) => void;
}

export const YearbookFlipbook: React.FC<YearbookFlipbookProps> = ({
  albumName,
  albumDesc,
  photos,
  onViewLarge,
  onDownload,
}) => {
  const [currentSpread, setCurrentSpread] = useState(0);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next");

  // Create pages
  // Page 0: Cover Page
  // Following pages: Spreads (Each spread has 2 pages: Left, Right)
  // Last page: Back Cover
  const totalPhotos = photos.length;
  // If we show 2 photos per spread, number of spreads is Math.ceil(totalPhotos / 2)
  const totalSpreads = Math.ceil(totalPhotos / 2) + 2; // +1 for Cover, +1 for Back Cover

  const handleNext = () => {
    if (currentSpread < totalSpreads - 1) {
      setFlipDirection("next");
      setCurrentSpread((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentSpread > 0) {
      setFlipDirection("prev");
      setCurrentSpread((prev) => prev - 1);
    }
  };

  return (
    <div id="yearbook-flipbook-container" className="w-full max-w-5xl mx-auto my-6 px-2 sm:px-4">
      {/* Top Controls / Breadcrumbs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6 bg-stone-50 p-3 rounded border border-stone-200">
        <div className="flex items-center gap-2">
          <BookOpen className="text-[#5A5A40] animate-pulse" size={18} />
          <span className="text-stone-700 font-sans font-medium text-xs sm:text-sm">
            Học bạ Kỷ Yếu Lớp 12A • 
            <span className="text-[#5A5A40] font-bold ml-1">{albumName}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-sans text-stone-500 font-semibold bg-white border border-stone-200 px-3 py-1 rounded shadow-xs">
          Trang {currentSpread === 0 ? "Bìa Trước" : currentSpread === totalSpreads - 1 ? "Bìa Sau" : `${currentSpread * 2 - 1} - ${currentSpread * 2}`} / {totalSpreads * 2 - 2}
        </div>
      </div>

      {/* Main Flipbook Wrapper */}
      <div className="relative select-none select-text-none overflow-hidden pb-4">
        
        {/* Desktop and Tablet Dual-Page View */}
        <div className="hidden md:block relative w-full aspect-[16/10] bg-[#efeade] rounded-lg border-4 border-[#3D3A2C] shadow-2xl overflow-hidden p-6 md:p-8">
          
          {/* Wooden Backdrop Texture inside binder */}
          <div className="absolute inset-0 bg-radial-gradient from-amber-50/10 to-stone-900/15 pointer-events-none z-10" />
          
          {/* Binder Metal Rings in middle */}
          {currentSpread > 0 && currentSpread < totalSpreads - 1 && (
            <div className="absolute left-1/2 top-0 bottom-0 w-8 -ml-4 z-40 flex flex-col justify-around py-12 pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-full flex items-center justify-between px-1">
                  {/* Left segment of metal ring */}
                  <div className="w-3.5 h-3 bg-gradient-to-r from-stone-400 via-stone-200 to-stone-400 rounded-full border border-stone-500/30 shadow-md transform translate-x-1" />
                  {/* Spine connection */}
                  <div className="h-0.5 w-1 bg-stone-500/25" />
                  {/* Right segment of metal ring */}
                  <div className="w-3.5 h-3 bg-gradient-to-l from-stone-400 via-stone-200 to-stone-400 rounded-full border border-stone-500/30 shadow-md transform -translate-x-1" />
                </div>
              ))}
            </div>
          )}

          {/* Book Shadow/Spine in middle */}
          {currentSpread > 0 && currentSpread < totalSpreads - 1 && (
            <div className="absolute left-1/2 top-0 bottom-0 w-12 -ml-6 bg-gradient-to-r from-stone-900/10 via-stone-900/25 to-stone-900/10 z-30 pointer-events-none" />
          )}

          <div className="w-full h-full flex relative z-20 gap-1">
            
            {/* SPREAD CONTAINERS */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentSpread}
                initial={{ 
                  opacity: 0, 
                  rotateY: flipDirection === "next" ? 45 : -45,
                  transformPerspective: 1800
                }}
                animate={{ 
                  opacity: 1, 
                  rotateY: 0,
                  transition: { duration: 0.6, ease: "easeOut" }
                }}
                exit={{ 
                  opacity: 0, 
                  rotateY: flipDirection === "next" ? -45 : 45,
                  transition: { duration: 0.4 }
                }}
                className="w-full h-full flex"
                style={{ transformStyle: "preserve-3d" }}
              >
                
                {/* PAGE 1: COVER SPREAD */}
                {currentSpread === 0 && (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <div className="w-1/2 h-full bg-[#5A5A40] text-stone-100 rounded-l border-r border-[#4A4A30] shadow-md flex flex-col justify-between p-8 relative overflow-hidden">
                      {/* Leather texture effect */}
                      <div className="absolute inset-0 bg-stone-950/15 pointer-events-none mix-blend-overlay" />
                      <div className="absolute -inset-10 bg-radial-gradient from-transparent to-stone-950/20 pointer-events-none" />
                      
                      {/* Decorative Gold Border */}
                      <div className="absolute inset-4 border border-dashed border-[#D5C29A]/40 rounded pointer-events-none" />
                      <div className="absolute inset-6 border-2 border-[#D5C29A]/60 rounded pointer-events-none" />

                      <div className="text-center mt-12 relative z-10">
                        <Bookmark className="mx-auto text-[#D5C29A] mb-4" size={40} />
                        <h1 className="text-2xl font-serif font-extrabold tracking-widest text-[#F5F2EB] uppercase">
                          Kỷ Yếu Lớp Học
                        </h1>
                        <div className="w-20 h-0.5 bg-[#D5C29A] mx-auto my-3" />
                        <span className="text-[10px] tracking-widest font-mono text-[#D5C29A] uppercase block">
                          Niên Khóa 1993 - 1996
                        </span>
                      </div>

                      <div className="text-center mb-12 relative z-10 w-full max-w-full overflow-hidden">
                        <h2 className="text-xl font-serif text-white tracking-wide font-normal mb-1 break-words">
                          {albumName}
                        </h2>
                        <p className="text-[11px] text-[#D5C29A]/80 font-sans italic max-w-xs mx-auto leading-relaxed break-words whitespace-pre-wrap">
                          {albumDesc || "Nơi lưu giữ ngàn khoảnh khắc đẹp bên chúng bạn và mái trường yêu dấu."}
                        </p>
                      </div>

                      <div className="text-center text-[10px] tracking-wide font-medium font-sans text-stone-300 relative z-10">
                        📚 Nhấp mũi tên bên phải để mở album
                      </div>
                    </div>

                    <div className="w-1/2 h-full bg-[#fcf9f2] rounded-r border-l border-stone-300 shadow-md flex flex-col justify-center items-center p-8 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(#e5e1d5_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />
                      
                      {/* Hardcover inner flap border */}
                      <div className="absolute inset-4 border border-stone-200 pointer-events-none" />

                      <div className="text-center max-w-xs z-10 px-4">
                        <Sparkles className="text-[#5A5A40]/40 mx-auto mb-4" size={32} />
                        <h3 className="text-stone-800 font-serif font-semibold text-base mb-2">Lời Giới Thiệu</h3>
                        <p className="text-xs text-stone-600 font-light font-sans leading-relaxed text-center">
                          Mỗi album là một cuộn băng thời gian thu nhỏ. Hãy lật từng trang, dừng lại một chút để ngắm nhìn những gương mặt bạn thân thuở học trò, thèm một cái ôm từ tuổi mười bảy rực rỡ.
                        </p>
                        <div className="mt-8 flex justify-center">
                          <button
                            onClick={handleNext}
                            className="px-4 py-2 bg-[#5A5A40] text-white rounded-sm font-sans font-bold text-xs uppercase tracking-wider shadow hover:bg-[#4A4A30] transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            Mở Sách <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAGES 2+: INTERNAL PHOTOS SPREADS */}
                {currentSpread > 0 && currentSpread < totalSpreads - 1 && (() => {
                  const leftPhotoIdx = (currentSpread - 1) * 2;
                  const rightPhotoIdx = leftPhotoIdx + 1;

                  const leftPhoto = photos[leftPhotoIdx];
                  const rightPhoto = photos[rightPhotoIdx];

                  return (
                    <div className="w-full h-full flex p-1">
                      {/* Left Page (Trang Trái) */}
                      <div className="w-1/2 h-full bg-[#fdfaf4] rounded-l border-r border-[#e3ded2] p-4 flex flex-col justify-between relative shadow-inner">
                        {/* Page background lined style */}
                        <div className="absolute inset-0 bg-[#fdfaf4] opacity-80" />
                        <div className="absolute inset-4 border border-dashed border-[#e6e1d5] rounded pointer-events-none z-0" />
                        
                        {leftPhoto ? (
                          <div className="h-full flex flex-col justify-between relative z-10">
                            {/* Polaroid Container */}
                            <div className="bg-white p-3 pb-6 border border-stone-200 shadow-md rounded-xs flex-1 flex flex-col justify-between max-h-[88%] transform rotate-[-1deg]">
                              <div className="aspect-[4/3] w-full bg-stone-50 overflow-hidden border border-stone-100 relative group">
                                <img
                                  src={leftPhoto.url}
                                  alt={leftPhoto.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-stone-900/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                  <button
                                    onClick={() => onViewLarge({ url: leftPhoto.url, title: leftPhoto.title, description: leftPhoto.description })}
                                    className="p-2 bg-white/90 rounded-full text-[#5A5A40] shadow hover:scale-110 transition-transform cursor-pointer"
                                  >
                                    <Maximize2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 text-center">
                                <h4 className="font-serif text-stone-800 font-bold text-xs sm:text-sm tracking-tight mb-1 break-words">
                                  {leftPhoto.title}
                                </h4>
                                {leftPhoto.date && (
                                  <p className="text-[9px] uppercase tracking-wider text-[#5A5A40] font-sans font-semibold mb-1">
                                    📅 {leftPhoto.date}
                                  </p>
                                )}
                                <p className="text-[10px] sm:text-[11px] text-stone-500 font-sans font-light leading-snug line-clamp-2 px-1 text-left break-words">
                                  {leftPhoto.description}
                                </p>
                              </div>
                            </div>

                            {/* Actions on bottom corner */}
                            <div className="flex items-center justify-between px-2 pt-2 border-t border-[#e2ddd1] mt-1 text-[10px] font-sans text-stone-400">
                              <span>Trang CL-{leftPhotoIdx + 1}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => onViewLarge({ url: leftPhoto.url, title: leftPhoto.title, description: leftPhoto.description })}
                                  className="hover:text-[#5A5A40] flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Maximize2 size={10} /> Xem lớn
                                </button>
                                <button
                                  onClick={() => onDownload(leftPhoto.url, leftPhoto.title)}
                                  className="hover:text-[#5A5A40] flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Download size={10} /> Tải về
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center relative z-10">
                            <p className="text-xs text-stone-300 italic font-sans font-light">Trang trống</p>
                          </div>
                        )}
                      </div>

                      {/* Right Page (Trang Phải) */}
                      <div className="w-1/2 h-full bg-[#fdfaf4] rounded-r border-l border-[#e3ded2] p-4 flex flex-col justify-between relative shadow-inner">
                        <div className="absolute inset-0 bg-[#fdfaf4] opacity-80" />
                        <div className="absolute inset-4 border border-dashed border-[#e6e1d5] rounded pointer-events-none z-0" />

                        {rightPhoto ? (
                          <div className="h-full flex flex-col justify-between relative z-10">
                            {/* Polaroid Container */}
                            <div className="bg-white p-3 pb-6 border border-stone-200 shadow-md rounded-xs flex-1 flex flex-col justify-between max-h-[88%] transform rotate-[1deg]">
                              <div className="aspect-[4/3] w-full bg-stone-50 overflow-hidden border border-stone-100 relative group">
                                <img
                                  src={rightPhoto.url}
                                  alt={rightPhoto.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-stone-900/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                  <button
                                    onClick={() => onViewLarge({ url: rightPhoto.url, title: rightPhoto.title, description: rightPhoto.description })}
                                    className="p-2 bg-white/90 rounded-full text-[#5A5A40] shadow hover:scale-110 transition-transform cursor-pointer"
                                  >
                                    <Maximize2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 text-center">
                                <h4 className="font-serif text-stone-800 font-bold text-xs sm:text-sm tracking-tight mb-1 break-words">
                                  {rightPhoto.title}
                                </h4>
                                {rightPhoto.date && (
                                  <p className="text-[9px] uppercase tracking-wider text-[#5A5A40] font-sans font-semibold mb-1">
                                    📅 {rightPhoto.date}
                                  </p>
                                )}
                                <p className="text-[10px] sm:text-[11px] text-stone-500 font-sans font-light leading-snug line-clamp-2 px-1 text-left break-words">
                                  {rightPhoto.description}
                                </p>
                              </div>
                            </div>

                            {/* Actions on bottom corner */}
                            <div className="flex items-center justify-between px-2 pt-2 border-t border-[#e2ddd1] mt-1 text-[10px] font-sans text-stone-400">
                              <span>Trang CL-{leftPhotoIdx + 2}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => onViewLarge({ url: rightPhoto.url, title: rightPhoto.title, description: rightPhoto.description })}
                                  className="hover:text-[#5A5A40] flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Maximize2 size={10} /> Xem lớn
                                </button>
                                <button
                                  onClick={() => onDownload(rightPhoto.url, rightPhoto.title)}
                                  className="hover:text-[#5A5A40] flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Download size={10} /> Tải về
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center relative z-10 dfn-empty">
                            <div className="text-center p-6 border border-dashed border-stone-200/80 rounded bg-stone-50/50 max-w-[200px]">
                              <p className="text-stone-300 font-sans italic text-xs mb-2">Trang cuối của album</p>
                              <BookOpen size={24} className="mx-auto text-stone-200" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* PAGE FINAL: BACK COVER SPREAD */}
                {currentSpread === totalSpreads - 1 && (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <div className="w-1/2 h-full bg-[#fcf9f2] rounded-l border-r border-stone-300 shadow-md flex flex-col justify-center items-center p-8 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(#e5e1d5_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />
                      <div className="absolute inset-4 border border-stone-200 pointer-events-none" />

                      <div className="text-center max-w-xs z-10 px-4">
                        <Sparkles className="text-[#5A5A40]/40 mx-auto mb-4" size={32} />
                        <h3 className="text-stone-800 font-serif font-semibold text-base mb-2">Gấp Sách Lại</h3>
                        <p className="text-xs text-stone-600 font-light font-sans leading-relaxed mb-6">
                          Dù thời gian có trôi đi, những lời tâm sự và bức ảnh này vẫn sẽ mãi nằm im lìm trong trang lưu bút lớp mình, chờ bạn quay lại lật giở.
                        </p>
                        <button
                          onClick={() => setCurrentSpread(0)}
                          className="px-4 py-2 bg-[#5A5A40]/10 hover:bg-[#5A5A40]/25 text-[#5A5A40] rounded-sm font-sans font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Quay Về Trang Đầu
                        </button>
                      </div>
                    </div>

                    <div className="w-1/2 h-full bg-[#5A5A40] text-stone-100 rounded-r border-l border-[#4A4A30] shadow-md flex flex-col justify-between p-8 relative overflow-hidden">
                      <div className="absolute inset-0 bg-stone-950/15 pointer-events-none mix-blend-overlay" />
                      <div className="absolute -inset-10 bg-radial-gradient from-transparent to-stone-950/20 pointer-events-none" />
                      <div className="absolute inset-4 border border-dashed border-[#D5C29A]/40 rounded pointer-events-none" />
                      <div className="absolute inset-6 border-2 border-[#D5C29A]/60 rounded pointer-events-none" />

                      <div className="text-center mt-12 relative z-10">
                        <h4 className="text-base font-serif tracking-widest text-[#F5F2EB] uppercase">
                          HẾT ALBUM
                        </h4>
                        <div className="w-12 h-px bg-[#D5C29A] mx-auto my-2" />
                      </div>

                      <div className="text-center mb-16 relative z-10 px-4">
                        <p className="text-[11px] text-[#D5C29A]/80 font-sans italic leading-relaxed max-w-xs mx-auto">
                          "Hôm nay lớp chúng ta sum vầy đông đủ<br />
                          Ngày mai mỗi người đi một ngả phương trời..."
                        </p>
                        <p className="text-[9px] text-[#D5C29A]/60 font-mono tracking-wider mt-4">TẬP THỂ LỚP 12A (1993 - 1996)</p>
                      </div>

                      <div className="text-center text-[10px] tracking-wide font-sans text-stone-300 relative z-10">
                        🛡️ Niên Giám Học Trò Thân Thương
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
            
          </div>

          {/* Previous Button Left Corner */}
          {currentSpread > 0 && (
            <button
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-50 p-3 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-full border border-stone-200/20 shadow-lg cursor-pointer hover:scale-105 transition-transform"
              title="Lật về trang trước"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {/* Next Button Right Corner */}
          {currentSpread < totalSpreads - 1 && (
            <button
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-50 p-3 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-full border border-stone-200/20 shadow-lg cursor-pointer hover:scale-105 transition-transform"
              title="Lật sang trang sau"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {/* ===================== MOBILE FLIPBOOK VIEW (Single Card Slider) ===================== */}
        <div className="block md:hidden bg-[#FAF8F5] rounded border border-stone-200 p-4 shadow mb-2 text-stone-800">
          <div className="relative aspect-[3/4] bg-white rounded border border-stone-150 p-3 pb-8 shadow-sm overflow-hidden flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSpread}
                initial={{ opacity: 0, x: flipDirection === "next" ? 80 : -80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: flipDirection === "next" ? -80 : 80 }}
                transition={{ duration: 0.3 }}
                className="h-full flex flex-col justify-between"
              >
                {currentSpread === 0 ? (
                  // Cover
                  <div className="h-full flex flex-col justify-between items-center text-center py-6 px-2 bg-[#5A5A40] text-stone-100 rounded-sm p-4 relative">
                    <div className="absolute inset-1 border border-dashed border-[#D5C29A]/30 rounded pointer-events-none" />
                    <Bookmark size={36} className="text-[#D5C29A] mt-2" />
                    <div>
                      <h3 className="text-xl font-serif font-bold text-white tracking-widest uppercase">{albumName}</h3>
                      <p className="text-[11px] text-[#D5C29A] font-sans font-light mt-1.5 px-2 italic">{albumDesc || "Ngăn lưu giữ kỉ niệm thân thương"}</p>
                    </div>
                    <button
                      onClick={handleNext}
                      className="px-4 py-2 bg-white text-[#5A5A40] rounded font-sans font-bold text-[10px] uppercase cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      Mở Album <ChevronRight size={12} />
                    </button>
                  </div>
                ) : currentSpread === totalSpreads - 1 ? (
                  // Back Cover
                  <div className="h-full flex flex-col justify-between items-center text-center py-8 px-4 bg-[#5A5A40]/90 text-stone-100 rounded-sm relative">
                    <div className="absolute inset-1 border border-dashed border-stone-300/30 rounded pointer-events-none" />
                    <Sparkles size={32} className="text-stone-300" />
                    <div>
                      <h3 className="text-base font-serif font-medium uppercase text-stone-100">Gấp Sách</h3>
                      <p className="text-[10px] text-stone-300 font-sans italic mt-1 leading-relaxed">Bộ sưu tập hình ảnh lưu bút đã khép lại thân ái!</p>
                    </div>
                    <button
                      onClick={() => setCurrentSpread(0)}
                      className="px-3 py-1.5 bg-stone-100 text-stone-700 rounded font-sans text-[10px] uppercase font-bold active:scale-95 cursor-pointer"
                    >
                      Bìa Trước
                    </button>
                  </div>
                ) : (() => {
                  const leftPhotoIdx = (currentSpread - 1) * 2;
                  // In mobile slider we can show left photo, if not exists or if they swipe next we can show the next one.
                  // For a simple mobile slide, page indexes are: photo 1 (page 1), photo 2 (page 2), etc.
                  // Let's directly adapt: page = currentSpread - 1, and render 1 photo at a time!
                  // This is cleaner and offers a gorgeous mobile reading experience!
                  const photoIdx = currentSpread - 1;
                  const photo = photos[photoIdx];

                  if (!photo) {
                    return (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-xs text-stone-400 italic">Hết danh sách ảnh</p>
                      </div>
                    );
                  }

                  return (
                    <div className="h-full flex flex-col justify-between">
                      <div>
                        {/* Photo Box */}
                        <div className="aspect-[4/3] w-full overflow-hidden border border-stone-100 rounded bg-stone-50 relative">
                          <img
                            src={photo.url}
                            alt={photo.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {/* Content text */}
                        <div className="mt-3 text-center sm:text-left px-1 w-full max-w-full overflow-hidden">
                          <h4 className="font-serif text-stone-850 font-bold text-sm tracking-tight mb-0.5 break-words">{photo.title}</h4>
                          {photo.date && <p className="text-[9px] uppercase tracking-wide font-sans font-bold text-[#5A5A40]">📅 {photo.date}</p>}
                          <p className="text-[11px] text-stone-500 font-sans font-light leading-relaxed text-left text-ellipsis overflow-hidden mt-1 line-clamp-3 break-words">
                            {photo.description}
                          </p>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center justify-between border-t border-stone-100 pt-2.5 mt-2">
                        <span className="text-[9px] text-[#5A5A40] font-sans font-semibold">Tấm {photoIdx + 1}/{totalPhotos}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => onViewLarge({ url: photo.url, title: photo.title, description: photo.description })}
                            className="p-1 px-2.5 text-[10px] bg-[#FAF8F5] border border-stone-200/80 rounded-sm text-stone-600 font-sans flex items-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Maximize2 size={10} /> Xem
                          </button>
                          <button
                            onClick={() => onDownload(photo.url, photo.title)}
                            className="p-1 px-2.5 text-[10px] bg-[#FAF8F5] border border-stone-200/80 rounded-sm text-stone-600 font-sans flex items-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Download size={10} /> Tải
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Steppers for mobile view */}
          <div className="flex items-center justify-between mt-3 text-stone-600">
            <button
              onClick={() => {
                setFlipDirection("prev");
                setCurrentSpread((prev) => Math.max(0, prev - 1));
              }}
              disabled={currentSpread === 0}
              className="p-1.5 px-3 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft size={14} /> Trang trước
            </button>
            <span className="text-[11px] font-sans font-semibold text-stone-500">
              Trang {currentSpread + 1} / {totalPhotos + 2}
            </span>
            <button
              onClick={() => {
                setFlipDirection("next");
                // For mobile we have totalPhotos + 2 states: 0 = cover, 1..totalPhotos = photos, totalPhotos+1 = back cover
                setCurrentSpread((prev) => Math.min(totalPhotos + 1, prev + 1));
              }}
              disabled={currentSpread === totalPhotos + 1}
              className="p-1.5 px-3 rounded bg-[#5A5A40] text-white text-xs font-bold disabled:opacity-45 flex items-center gap-1 cursor-pointer"
            >
              Lật trang <ChevronRight size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
