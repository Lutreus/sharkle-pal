const { app, BrowserWindow, Menu, MenuItem, ipcMain, screen } = require('electron');
const windowStateKeeper = require('electron-window-state');
const AutoLaunch = require('auto-launch');

let win = null;

// --- Autolaunch Setup ---
let autolaunchConfig = {
    name: "SharklePal"
}
if(process.env.APPIMAGE){
    autolaunchConfig = {...autolaunchConfig, path:process.env.APPIMAGE}
}
const autoLauncher = new AutoLaunch(autolaunchConfig);

const disableAutolaunchLabel = "I'm awful and I don't want to see Sharkie again";
const enableAutolaunchLabel = "I really love Sharkie and I want it on my PC every time it starts";

// --- Global State (No persistence) ---
let currentWindowSize = 240;
let isInvertedState = false;

app.disableHardwareAcceleration();

// --- Window Creation & State Management ---

function createWindow () {
    const primaryDisplay = screen.getPrimaryDisplay();
    // Use workAreaSize to exclude taskbar/dock from the calculation
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    let windowSize = currentWindowSize; 
    
    // Calculate Bottom-Right Position (fixed size is 240x240 for calculation)
    const initialX = screenWidth - windowSize;
    const initialY = screenHeight - windowSize;
    
    // Use windowStateKeeper to manage persistence of position and size after the first launch.
    let mainWindowState = windowStateKeeper({
        defaultWidth: windowSize,
        defaultHeight: windowSize,
        defaultX: initialX,
        defaultY: initialY
    });
    
    // Use persisted state if available, otherwise use the calculated bottom-right position.
    let finalX = mainWindowState.x !== undefined ? mainWindowState.x : initialX;
    let finalY = mainWindowState.y !== undefined ? mainWindowState.y : initialY;
    windowSize = mainWindowState.width;

    // FIX 1: Update the global state variable with the size loaded from persistence.
    currentWindowSize = windowSize; 

    win = new BrowserWindow({
        width: windowSize,
        height: windowSize,
        x: finalX, 
        y: finalY, 
        frame: false,
        resizable: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true, 
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
    win.setMenu(null);
    win.setSkipTaskbar(true);
    win.isMenuBarVisible(false);

    // Initial settings sync after load
    win.webContents.on('did-finish-load', () => {
        win.webContents.send('load-settings', {
            inverted: isInvertedState,
            size: win.getSize()[0]
        });
    });

    mainWindowState.manage(win);
}

// --- App Lifecycle ---

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('ready', function () {
    setTimeout(createWindow, 300);
});

// --- Menu Functions ---

function resizeWindow(size) {
    if (win) {
        currentWindowSize = size;
        win.setSize(size, size);
        win.webContents.send('window-resize', size);
    }
}

function updateAutolaunchMenuOptionTo(isEnabled){
    let updatedMenu = new Menu();
    populateMenuWithEverithingButTheAutolaunch(updatedMenu);
    addAutolaunchMenuOption(isEnabled);
    // Menu object assignment is tricky; reassigning to a local let 
    // named `menu` is the only way to update the variable used by ipcMain.
    menu = updatedMenu; 
}

function populateMenuWithEverithingButTheAutolaunch(menu){
    menu.append(new MenuItem({ label: 'Big Sharkle', click: () => resizeWindow(240) }));
    menu.append(new MenuItem({ label: 'Medium Sharkle', click: () => resizeWindow(140) }));
    menu.append(new MenuItem({ label: 'Small Sharkle', click: () => resizeWindow(80) }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
        label: 'Invert Sharkle',
        click: () => {
            isInvertedState = !isInvertedState;
            if (win) { 
                win.webContents.send('invert-sharkie', isInvertedState);
            }
        }
    }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Kill Sharkle :(', click: () => app.quit() }));
}

function addAutolaunchMenuOptionCheckingSystem(){
    autoLauncher.isEnabled().then((isEnabled)=>{
        addAutolaunchMenuOption(isEnabled);
    });
}

function addAutolaunchMenuOption(isEnabled){
    const autolaunchItem = new MenuItem({
        label: isEnabled ? disableAutolaunchLabel : enableAutolaunchLabel,
        role: 'autolaunch',
        click: () => {
            if (isEnabled) {
                autoLauncher.disable();
            } else {
                autoLauncher.enable();
            }
            updateAutolaunchMenuOptionTo(!isEnabled);
        }
    });
    menu.append(autolaunchItem);
}

// Initialize the menu structure
let menu = new Menu();
populateMenuWithEverithingButTheAutolaunch(menu);
addAutolaunchMenuOptionCheckingSystem();


// --- IPC Communication ---

// Handles right-click menu pop-up
ipcMain.on('mouse-down', (event, startCoords) => {
    if (startCoords.button === 2) { 
        menu.popup({
            window: win,
            x: startCoords.x, // clientX
            y: startCoords.y  // clientY
        });
    }
});

// SYNCHRONOUS: Gets window position for drag start
ipcMain.on('get-window-position', (event) => {
    if (win) {
        const [x, y] = win.getPosition();
        event.returnValue = { x, y };
    } else {
        event.returnValue = { x: 0, y: 0 };
    }
});

// ASYNCHRONOUS: Moves the window during drag
ipcMain.on('set-window-position', (event, newPos) => {
    if (win) {
        // FIX 2: Use currentWindowSize for dimensions during drag 
        // to prevent unintended resizing/growth.
        win.setBounds({ 
            x: newPos.x, 
            y: newPos.y, 
            width: currentWindowSize, 
            height: currentWindowSize 
        });
    }
});