// frontend/src/contexts/DataContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext'; // To ensure data is fetched only when authenticated

const DataContext = createContext(null);

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({
    darkMode: false,
    showQuickAdd: true,
  });
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState(null);

  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      if (!isAuthenticated) {
        setColumns([]);
        setTasks([]);
        setIsLoadingData(false);
        return;
      }

      setIsLoadingData(true);
      setDataError(null);
      try {
        const response = await fetch('/api/data');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch data: ${response.status}`);
        }
        const fetchedData = await response.json();

        setColumns(Array.isArray(fetchedData.columns) ? fetchedData.columns : []);
        setTasks(Array.isArray(fetchedData.tasks) ? fetchedData.tasks : []);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setDataError(error.message);
        setColumns([]);
        setTasks([]);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, [isAuthenticated]);

  const addTaskToList = (newTask) => {
    setTasks(prevTasks => [...prevTasks, newTask]);
  };

  const updateTaskInList = (updatedTask) => {
    setTasks(prevTasks => prevTasks.map(task => task.id === updatedTask.id ? updatedTask : task));
  };

  const deleteTaskFromList = (taskId) => {
    setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
  };

  const value = {
    columns,
    setColumns,
    tasks,
    setTasks,
    settings,
    setSettings,
    isLoadingData,
    dataError,
    addTaskToList,
    updateTaskInList,
    deleteTaskFromList, // Added
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};
