import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Comment, Classmate } from "../types";
import { MessageSquare, Send, Clock, Trash2, User, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CommentsSectionProps {
  itemId: string;
  classmates: Classmate[];
  isAdmin: boolean;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({ itemId, classmates, isAdmin }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [customAuthor, setCustomAuthor] = useState("");
  const [isTypingCustom, setIsTypingCustom] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Listen to comments real-time for this itemId
  useEffect(() => {
    if (!isOpen) return;

    const commentsCol = collection(db, "comments");
    const q = query(
      commentsCol,
      where("itemId", "==", itemId),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Comment[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            itemId: data.itemId,
            author: data.author,
            content: data.content,
            createdAt: data.createdAt,
          });
        });
        setComments(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `comments?itemId=${itemId}`);
      }
    );

    return () => unsubscribe();
  }, [itemId, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAuthor = isTypingCustom ? customAuthor.trim() : authorName;
    if (!finalAuthor) {
      alert("Vui lòng nhập hoặc chọn tên của bạn!");
      return;
    }
    if (!newComment.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "comments"), {
        itemId,
        author: finalAuthor,
        content: newComment.trim(),
        createdAt: serverTimestamp(),
      });
      setNewComment("");
      // Retain the author name selection for convenience but clear input if we were standard typing
      if (isTypingCustom) {
        // Leave it filled so they can write multiple messages easily
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá lời nhắn này không?")) return;
    try {
      await deleteDoc(doc(db, "comments", commentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `comments/${commentId}`);
    }
  };

  const formatCommentTime = (createdAt: any) => {
    if (!createdAt) return "Vừa xong";
    // If it's a Firestore timestamp
    if (createdAt.seconds) {
      const date = new Date(createdAt.seconds * 1000);
      return date.toLocaleDateString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "numeric",
      });
    }
    return new Date(createdAt).toLocaleString("vi-VN");
  };

  return (
    <div className="mt-4 pt-3 border-t border-dashed border-stone-200 font-sans text-left">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FDFCF7] hover:bg-[#F5F2E6] border border-[#E5E0C0]/60 hover:border-[#8F8F6E]/40 text-[#5A5A40] rounded-md text-[11px] font-sans font-bold transition-all cursor-pointer w-full justify-between"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare size={12} className="text-[#8F8F6E]" />
          <span>
            {isOpen ? "Thu gọn lời nhắn" : `Lời nhắn & Bình cảm (${comments.length > 0 ? comments.length : "Trống"})`}
          </span>
        </span>
        <span className="opacity-60 text-[9px] uppercase tracking-wider">
          {isOpen ? "Đóng ▲" : "Xem/Gửi ▼"}
        </span>
      </button>

      {/* Expandable Wrapper */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-[#FAF9F5] p-3 rounded-md border border-[#E5E0C0]/30 mt-2 space-y-3">
              {/* Messages Lists */}
              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {comments.length === 0 ? (
                  <p className="text-[11px] text-stone-500 italic py-2 text-center select-none flex items-center justify-center gap-1">
                    🌳 Chưa có lời nhắn nào dưới bức ảnh này. Hãy để lại lời chúc đầu tiên nhé!
                  </p>
                ) : (
                  comments.map((comment) => (
                    <div 
                      key={comment.id}
                      className="bg-white p-2 rounded border border-stone-200/40 shadow-sm relative group/msg hover:border-[#8F8F6E]/30 transition-all"
                    >
                      {/* Classmate author check/badge */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-stone-800 text-[11.5px] font-sans flex items-center gap-1">
                          <User size={10} className="text-[#5A5A40]/80" />
                          {comment.author}
                        </span>
                        <span className="text-[9px] text-stone-400 flex items-center gap-0.5">
                          <Clock size={9} />
                          {formatCommentTime(comment.createdAt)}
                        </span>
                      </div>
                      
                      {/* Plain content rendering */}
                      <p className="text-stone-700 text-xs leading-normal font-sans break-words bg-[#FAFAFC]/40 p-1 rounded font-light whitespace-pre-wrap pl-1.5 border-l-2 border-[#8F8F6E]/40">
                        {comment.content}
                      </p>

                      {/* Admin delete code */}
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover/msg:opacity-100 hover:text-red-600 text-stone-400 p-0.5 transition-opacity cursor-pointer duration-200"
                          title="Xoá lời nhắn"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add Suggestion / Form */}
              <form onSubmit={handleSubmit} className="border-t border-stone-200/60 pt-2.5 space-y-2">
                <div className="flex flex-col sm:flex-row gap-1.5">
                  {/* Select Author Name */}
                  <div className="flex-1 min-w-[120px]">
                    {isTypingCustom ? (
                      <input
                        type="text"
                        placeholder="Tên của bạn..."
                        value={customAuthor}
                        onChange={(e) => setCustomAuthor(e.target.value)}
                        className="w-full text-xs bg-white border border-[#C4BA92] rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5A5A40] text-stone-800 placeholder-stone-400"
                        maxLength={30}
                        required
                      />
                    ) : (
                      <select
                        value={authorName}
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            setIsTypingCustom(true);
                          } else {
                            setAuthorName(e.target.value);
                          }
                        }}
                        className="w-full text-xs bg-white border border-[#C4BA92] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5A5A40] text-stone-700 font-sans"
                        required
                      >
                        <option value="">-- Danh tính bạn? --</option>
                        {classmates.map((member) => (
                          <option key={member.id} value={member.name}>
                            {(member.nickname) ? `${member.name} (${member.nickname})` : member.name}
                          </option>
                        ))}
                        <option value="__custom__">✍️ Khác (Tự nhập tên...)</option>
                      </select>
                    )}
                  </div>

                  {/* Typing mode toggler */}
                  {isTypingCustom && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTypingCustom(false);
                        setCustomAuthor("");
                      }}
                      className="text-[10px] text-stone-500 hover:text-[#5A5A40] shrink-0 self-center underline"
                    >
                      Chọn từ danh sách
                    </button>
                  )}
                </div>

                {/* Text Message Content */}
                <div className="flex gap-1">
                  <textarea
                    placeholder="Viết một lời bình hoặc lời nhắn chân thành ngắn..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1 text-xs bg-white border border-[#C4BA92] rounded p-2 focus:outline-none focus:ring-1 focus:ring-[#5A5A40] min-h-[45px] max-h-[100px] text-stone-800 resize-none font-sans placeholder-stone-400"
                    maxLength={200}
                    required
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting || !newComment.trim()}
                    className="bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded px-3 flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    title="Gửi lời nhắn"
                  >
                    <Send size={12} className={isSubmitting ? "animate-pulse" : ""} />
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
