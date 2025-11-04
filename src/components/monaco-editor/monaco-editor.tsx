import * as monaco from 'monaco-editor';

const workerCache = new Map();

const getCachedWorker = (workerUrl) => {
    if (!workerCache.has(workerUrl)) {
        const worker = new Worker(workerUrl);
        workerCache.set(workerUrl, worker);
    }
    return workerCache.get(workerUrl);
};

const getWorker = () => {
    const workerUrl = 'path/to/worker'; // adjust as necessary
    return getCachedWorker(workerUrl);
};

// Cleanup logic
useEffect(() => {
    const worker = getWorker();
    
    return () => {
        worker.terminate();
        // Cleanup from workerCache if necessary
    };
}, []);