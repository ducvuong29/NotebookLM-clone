export const EMPTY_STATE = {
  notebooks: {
    title: "Chưa có notebook nào",
    description: "Tạo notebook đầu tiên để bắt đầu khám phá tài liệu!",
  },
  sources: {
    title: "Chưa có tài liệu nào",
    description: "Hãy tải lên tài liệu đầu tiên để AI có thể hỗ trợ bạn.",
  },
  chat: {
    title: "Bắt đầu cuộc trò chuyện",
    description: "Hãy hỏi bất kỳ điều gì về tài liệu của bạn!",
  },
  flowchart: {
    title: "Chưa có sơ đồ nào",
    description: "Chọn một tài liệu và nhấn \"Tạo sơ đồ\" để bắt đầu.",
  },
  search: {
    title: "Không tìm thấy kết quả",
    description: "Thử tìm kiếm với từ khóa khác.",
  },
} as const;
