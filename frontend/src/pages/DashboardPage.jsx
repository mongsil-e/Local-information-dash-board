// frontend/src/pages/DashboardPage.jsx
import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import Board from '../components/dashboard/Board';
import TaskModal from '../components/dashboard/TaskModal';
import PgmHistoryView from '../components/pgm/PgmHistoryView';
import { DragDropContext } from '@hello-pangea/dnd';

function DashboardPage() {
  const {
    columns,
    tasks,
    isLoadingData,
    dataError,
    settings,
    addTaskToList,
    updateTaskInList,
    deleteTaskFromList
  } = useData();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [targetColumnId, setTargetColumnId] = useState(null);

  const handleSearchChange = (e) => setSearchTerm(e.target.value);

  const handleOpenModalForAdd = (columnId) => {
    setEditingTask(null);
    setTargetColumnId(columnId);
    setIsModalOpen(true);
  };

  const handleOpenModalForEdit = (task) => {
    setTargetColumnId(null);
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setTargetColumnId(null);
  };

  const handleTaskSubmit = async (taskData) => {
    let csrfToken = '';
    try {
      const csrfResponse = await fetch('/api/csrf-token');
      if (!csrfResponse.ok) {
        const errorText = await csrfResponse.text();
        throw new Error(`Failed to fetch CSRF token: ${errorText}`);
      }
      const csrfData = await csrfResponse.json();
      csrfToken = csrfData.csrfToken;
      if (!csrfToken) throw new Error('CSRF token not received.');

      if (taskData.id && !taskData.id.startsWith('client_')) {
        const response = await fetch(`/api/tasks/${taskData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify(taskData),
        });
        if (!response.ok) {
          const errorResult = await response.json().catch(() => ({ error: `Failed to update task. Status: ${response.status}` }));
          throw new Error(errorResult.error || 'Failed to update task');
        }
        const updatedTask = await response.json();
        updateTaskInList(updatedTask);
      } else {
        const idToUse = taskData.id && taskData.id.startsWith('client_') ? taskData.id : `client_${Date.now()}`;
        const newTaskPayload = { ...taskData, id: idToUse };

        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify(newTaskPayload),
        });
        if (!response.ok) {
          const errorResult = await response.json().catch(() => ({ error: `Failed to add task. Status: ${response.status}` }));
          throw new Error(errorResult.error || 'Failed to add task');
        }
        const addedTask = await response.json();
        if (taskData.id && taskData.id.startsWith('client_') && taskData.id !== addedTask.id) {
            deleteTaskFromList(taskData.id);
        }
        addTaskToList(addedTask);
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error submitting task:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteTask = async (taskId, taskTitle) => {
    if (!window.confirm(`'${taskTitle}' 업무를 삭제하시겠습니까?`)) return;
    let csrfToken = '';
    try {
      const csrfResponse = await fetch('/api/csrf-token');
      if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token for delete');
      const csrfData = await csrfResponse.json();
      csrfToken = csrfData.csrfToken;
      if (!csrfToken) throw new Error('CSRF token not received for delete.');

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Failed to delete task');
      }
      deleteTaskFromList(taskId);
    } catch (error) {
      console.error('Error deleting task:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleToggleComplete = async (taskToToggle) => {
    let csrfToken = '';
    try {
      const csrfResponse = await fetch('/api/csrf-token');
      if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token for toggle');
      const csrfData = await csrfResponse.json();
      csrfToken = csrfData.csrfToken;
      if (!csrfToken) throw new Error('CSRF token not received for toggle.');

      const newCompletedStatus = !taskToToggle.completed;
      const welldoneColumn = columns.find(col => col.title === "완료");
      const welldoneColumnId = welldoneColumn ? welldoneColumn.id : 'welldone';

      let updatePayload = { completed: newCompletedStatus };

      if (newCompletedStatus) {
        if (taskToToggle.columnId !== welldoneColumnId) {
          updatePayload.originalColumnIdBeforeCompletion = taskToToggle.columnId;
          updatePayload.columnId = welldoneColumnId;
        }
      } else {
        if (taskToToggle.columnId === welldoneColumnId && taskToToggle.originalColumnIdBeforeCompletion) {
          updatePayload.columnId = taskToToggle.originalColumnIdBeforeCompletion;
          updatePayload.originalColumnIdBeforeCompletion = null;
        }
      }

      const response = await fetch(`/api/tasks/${taskToToggle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Failed to toggle task completion');
      }
      const updatedTask = await response.json();
      updateTaskInList(updatedTask);
    } catch (error) {
      console.error('Error toggling task:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleOnDragEndMainBoard = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const taskId = draggableId;
    const newColumnId = destination.droppableId;
    const allTasks = Array.isArray(tasks) ? tasks : [];
    const originalTask = allTasks.find(t => t.id === taskId);

    if (!originalTask) {
      console.error("Dragged task not found in context tasks array for main board");
      return;
    }

    if (source.droppableId !== newColumnId) {
      const updatedTaskOptimistic = { ...originalTask, columnId: newColumnId };
      updateTaskInList(updatedTaskOptimistic);

      try {
        const csrfResponse = await fetch('/api/csrf-token');
        if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token for main board D&D');
        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken;
        if (!csrfToken) throw new Error('CSRF token not received for main board D&D.');

        const apiResponse = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ columnId: newColumnId }),
        });
        if (!apiResponse.ok) {
          const errorResult = await apiResponse.json().catch(() => ({}));
          throw new Error(errorResult.error || 'Failed to update task column on server');
        }
        const serverUpdatedTask = await apiResponse.json();
        updateTaskInList(serverUpdatedTask);
      } catch (error) {
        console.error('Error updating task column:', error);
        alert(`Error moving task: ${error.message}. Reverting optimistic update.`);
        updateTaskInList(originalTask);
      }
    } else {
      console.log('Reordering within the same main board column - not yet implemented.');
    }
  };

  const handleOnDragEndPgmBoard = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const taskId = draggableId;
    const newPgmColumnId = destination.droppableId;
    const allTasks = Array.isArray(tasks) ? tasks : [];
    const originalTask = allTasks.find(t => t.id === taskId);

    if (!originalTask) {
      console.error("Dragged task not found in context tasks array for PGM board");
      return;
    }

    if (source.droppableId !== newPgmColumnId) {
      const updatedTaskOptimistic = { ...originalTask, columnId: newPgmColumnId };
      updateTaskInList(updatedTaskOptimistic);

      try {
        const csrfResponse = await fetch('/api/csrf-token');
        if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token for PGM D&D');
        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken;
        if (!csrfToken) throw new Error('CSRF token not received for PGM D&D.');

        const apiResponse = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ columnId: newPgmColumnId }),
        });
        if (!apiResponse.ok) {
          const errorResult = await apiResponse.json().catch(() => ({}));
          throw new Error(errorResult.error || 'Failed to update PGM task column on server');
        }
        const serverUpdatedTask = await apiResponse.json();
        updateTaskInList(serverUpdatedTask);
      } catch (error) {
        console.error('Error updating PGM task column:', error);
        alert(`Error moving PGM task: ${error.message}. Reverting optimistic update.`);
        updateTaskInList(originalTask);
      }
    } else {
      console.log('Reordering within the same PGM sub-column - not yet implemented.');
    }
  };

  if (isLoadingData) return <div>Loading dashboard data...</div>;
  if (dataError) return <div style={{ color: 'red' }}>Error loading data: {dataError}</div>;

  const pgmDashboardColumnIds = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'];
  const mainBoardColumns = columns.filter(col => !pgmDashboardColumnIds.includes(col.id));

  let filteredMainBoardTasks = Array.isArray(tasks) ? tasks.filter(task => !pgmDashboardColumnIds.includes(task.columnId)) : [];
  if (searchTerm.trim() !== '') {
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    filteredMainBoardTasks = filteredMainBoardTasks.filter(task => {
      const searchableText = [task.title || '', task.description || '', task.assignees || '', Array.isArray(task.tags) ? task.tags.join(' ') : ''].join(' ').toLowerCase();
      return searchableText.includes(lowercasedSearchTerm);
    });
  }

  const pgmColumnIdsPattern = /^(AVI-|ATTACH-)/;
  const allPgmTasks = Array.isArray(tasks) ? tasks.filter(task => pgmColumnIdsPattern.test(task.columnId)) : [];

  return (
    <div className="container">
      <div className="tabs">
        <div className={`tabs__tab ${activeTab === 'dashboard' ? 'tabs__tab--active' : ''}`} onClick={() => setActiveTab('dashboard')}>업무 대시보드</div>
        <div className={`tabs__tab ${activeTab === 'pgm-history' ? 'tabs__tab--active' : ''}`} onClick={() => setActiveTab('pgm-history')}>PGM Update history</div>
      </div>
      <div className="search">
        <span className="search__icon">🔍</span>
        <input type="text" id="searchInput" className="search__input" placeholder="업무 검색 (제목, 설명, 담당자, 태그)" value={searchTerm} onChange={handleSearchChange} />
      </div>
      <div className="tab-contents">
        {activeTab === 'dashboard' && (
          <DragDropContext onDragEnd={handleOnDragEndMainBoard}>
            <div className="tab-content tab-content--active" id="dashboard-content">
              <Board
                columns={mainBoardColumns}
                tasks={filteredMainBoardTasks}
                onOpenModalForAdd={handleOpenModalForAdd}
                onOpenModalForEdit={handleOpenModalForEdit}
                onDeleteTask={handleDeleteTask}
                onToggleComplete={handleToggleComplete}
              />
            </div>
          </DragDropContext>
        )}
        {activeTab === 'pgm-history' && (
          <DragDropContext onDragEnd={handleOnDragEndPgmBoard}>
            <div className="tab-content tab-content--active" id="pgm-history-content">
              <PgmHistoryView
                allPgmTasks={allPgmTasks}
                onOpenModalForAdd={handleOpenModalForAdd}
                onOpenModalForEdit={handleOpenModalForEdit}
                onDeleteTask={handleDeleteTask}
                onToggleComplete={handleToggleComplete}
              />
            </div>
          </DragDropContext>
        )}
      </div>
      <TaskModal isOpen={isModalOpen} onClose={handleCloseModal} onSubmit={handleTaskSubmit} taskToEdit={editingTask} columnIdForNewTask={targetColumnId} />
    </div>
  );
}
export default DashboardPage;
