// frontend/src/components/dashboard/TaskModal.jsx
import React, { useState, useEffect } from 'react';
import './TaskModal.css'; // Create this CSS file

// Temporary TagInput component (can be extracted later)
const TagInput = ({ tags, setTags }) => {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (e) => setInputValue(e.target.value);

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        setTags([...tags, inputValue.trim()]);
      }
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div>
      <div className="form-group__tags">
        {tags.map(tag => (
          <span key={tag} className="form-group__tag">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="form-group__tag-remove">×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        className="form-group__input form-group__tag-input" // Added form-group__input for consistent styling
        placeholder="태그 입력 후 엔터"
      />
    </div>
  );
};

const TaskModal = ({ isOpen, onClose, taskToEdit, columnIdForNewTask, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignees, setAssignees] = useState('');
  const [priority, setPriority] = useState('medium');
  const [tags, setTags] = useState([]);
  const [currentTaskId, setCurrentTaskId] = useState(null);

  useEffect(() => {
    if (isOpen) { // Only update state if modal is open
      if (taskToEdit) {
        setTitle(taskToEdit.title || '');
        setDescription(taskToEdit.description || '');
        setDueDate(taskToEdit.dueDate || '');
        setAssignees(taskToEdit.assignees || '');
        setPriority(taskToEdit.priority || 'medium');
        setTags(Array.isArray(taskToEdit.tags) ? taskToEdit.tags : []);
        setCurrentTaskId(taskToEdit.id);
      } else {
        // Reset for new task
        setTitle('');
        setDescription('');
        // Default to today for new tasks, or leave empty if preferred
        setDueDate(new Date().toISOString().split('T')[0]);
        setAssignees('');
        setPriority('medium');
        setTags([]);
        setCurrentTaskId(null);
      }
    }
  }, [taskToEdit, isOpen]); // Re-populate when taskToEdit changes or modal opens

  const handleSubmit = (e) => {
    e.preventDefault();
    const taskData = {
      id: currentTaskId, // null for new tasks
      columnId: taskToEdit ? taskToEdit.columnId : columnIdForNewTask,
      title,
      description,
      dueDate,
      assignees,
      priority,
      tags,
      // completed status is not handled in this form, usually by checkbox on task item itself
    };
    onSubmit(taskData); // Pass data to parent for actual API call
  };

  if (!isOpen) return null;

  return (
    <div className="modal visible" role="dialog" aria-modal="true" aria-labelledby="modalTitleId">
      <div className="modal__content">
        <div className="modal__header">
          <div id="modalTitleId" className="modal__title">{taskToEdit ? '업무 수정' : '새 업무 추가'}</div>
          <button className="modal__close" aria-label="모달 닫기" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} id="taskFormModal"> {/* Changed id to avoid conflict with original index.html's form */}
          {/* Hidden field for task ID for edit mode, not strictly necessary if currentTaskId state is used for submission logic */}
          {/* <input type="hidden" name="taskId" value={currentTaskId || ''} /> */}
          <div className="form-group">
            <label htmlFor="taskModalTitle" className="form-group__label">업무명 <span aria-hidden="true">*</span></label>
            <input type="text" id="taskModalTitle" value={title} onChange={(e) => setTitle(e.target.value)} className="form-group__input" required />
          </div>
          <div className="form-group">
            <label htmlFor="taskModalDescription" className="form-group__label">설명</label>
            <textarea id="taskModalDescription" value={description} onChange={(e) => setDescription(e.target.value)} className="form-group__textarea"></textarea>
          </div>
          <div className="form-group">
            <label htmlFor="taskModalDueDate" className="form-group__label">마감일</label>
            <input type="date" id="taskModalDueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="form-group__input" />
          </div>
          <div className="form-group">
            <label htmlFor="taskModalAssignees" className="form-group__label">담당자</label>
            <input type="text" id="taskModalAssignees" value={assignees} onChange={(e) => setAssignees(e.target.value)} className="form-group__input" placeholder="콤마(,)로 구분" />
          </div>
          <div className="form-group">
            <label htmlFor="taskModalPriority" className="form-group__label">중요도</label>
            <select id="taskModalPriority" value={priority} onChange={(e) => setPriority(e.target.value)} className="form-group__select">
              <option value="low">낮음</option>
              <option value="medium">보통</option>
              <option value="high">높음</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="taskModalTagInput" className="form-group__label">태그</label> {/* Changed label's htmlFor to avoid conflict if TagInput is used elsewhere */}
            <TagInput tags={tags} setTags={setTags} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn--primary">저장</button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default TaskModal;
