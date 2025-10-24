const { app, BrowserWindow, Menu, MenuItem, ipcMain, screen } = require('electron');
const windowStateKeeper = require('electron-window-state');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');
let win = null;
const SLEEPY_INTERVAL_MS = 5 * 60 * 1000; 
const AWAKE_INTERVAL_MS = 15 * 60 * 1000; 

// Store information
const store = new Store({
    defaults: {
        invertedState: false,
        windowSize: 240,
        alwaysOnTopState: false,
        sleepy: true  
    }
});
let currentWindowSize = store.get('windowSize', 240);
let isInvertedState = store.get('invertedState');
let isAlwaysOnTop = store.get('alwaysOnTopState', false);
let sleepy = store.get('sleepy', true);
let autolaunchConfig = { name: "SharklePal" };
if (process.env.APPIMAGE) {
    autolaunchConfig.path = process.env.APPIMAGE;
}
const autoLauncher = new AutoLaunch(autolaunchConfig);
const disableAutolaunchLabel = "I'm awful and I don't want to see Sharkie again";
const enableAutolaunchLabel = "I really love Sharkie and I want it on my PC every time it starts";
app.disableHardwareAcceleration();

function getSleepCheckInterval() {
    return sleepy ? SLEEPY_INTERVAL_MS : AWAKE_INTERVAL_MS;
}

function sendSettingsToRenderer() {
    if (win) {
        win.webContents.send('load-settings', {
            inverted: isInvertedState,
            size: currentWindowSize,
            sleepCheckInterval: getSleepCheckInterval() // New: Send the calculated interval
        });
    }
}

// creates window
function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const initialX = screenWidth - currentWindowSize;
    const initialY = screenHeight - currentWindowSize;
    const mainWindowState = windowStateKeeper({
        defaultWidth: currentWindowSize,
        defaultHeight: currentWindowSize,
        defaultX: initialX,
        defaultY: initialY
    });
    const finalX = mainWindowState.x !== undefined ? mainWindowState.x : initialX;
    const finalY = mainWindowState.y !== undefined ? mainWindowState.y : initialY;
    win = new BrowserWindow({
        width: currentWindowSize,
        height: currentWindowSize,
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
    mainWindowState.manage(win);
    resizeWindow(currentWindowSize);
    win.setMenu(null);
    win.setSkipTaskbar(true);
    win.isMenuBarVisible(false);
    win.setAlwaysOnTop(isAlwaysOnTop, 'normal');
    win.webContents.on('did-finish-load', () => {
        sendSettingsToRenderer(); 
        updateFullMenu();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('ready', () => {
    createWindow();
});

function resizeWindow(size) {
    if (win) {
        currentWindowSize = size;
        store.set('windowSize', size);
        const bounds = win.getBounds();
        win.setBounds({
            x: bounds.x,
            y: bounds.y,
            width: size,
            height: size
        });
        win.webContents.send('window-resize', size);
    }
}

// MENU
let menu = new Menu();
function updateFullMenu() {
    const updatedMenu = new Menu();
    populateMenuWithEverythingButTheAutolaunch(updatedMenu);
    addAlwaysOnTopMenuOption(updatedMenu);
    addSleepy(updatedMenu); 
    addAutolaunchMenuOptionCheckingSystem(updatedMenu);
    Menu.setApplicationMenu(updatedMenu);
    menu = updatedMenu;
}
function updateAutolaunchMenuOptionTo(isEnabled) {
    updateFullMenu();
}
function populateMenuWithEverythingButTheAutolaunch(menu) {
    menu.append(new MenuItem({ label: 'Small Sharkle', click: () => resizeWindow(80) }));
    menu.append(new MenuItem({ label: 'Medium Sharkle', click: () => resizeWindow(140) }));
    menu.append(new MenuItem({ label: 'Big Sharkle', click: () => resizeWindow(240) }));
    menu.append(new MenuItem({ label: 'Jumbo Sharkle', click: () => resizeWindow(480) }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
        label: 'Invert Sharkle',
        click: () => {
            isInvertedState = !isInvertedState;
            store.set('invertedState', isInvertedState);
            if (win) {
                win.webContents.send('invert-sharkie', isInvertedState);
            }
        }
    }));
    menu.append(new MenuItem({ type: 'separator' }));
}

function addAlwaysOnTopMenuOption(menu) {
    const label = isAlwaysOnTop ? 'Unpin Sharkle' : 'Keep Sharkle on Top';
    menu.append(new MenuItem({
        label: label,
        click: () => {
            isAlwaysOnTop = !isAlwaysOnTop;
            store.set('alwaysOnTopState', isAlwaysOnTop);
            if (win) {
                win.setAlwaysOnTop(isAlwaysOnTop, 'normal');
            }
            updateFullMenu();
        }
    }));
    menu.append(new MenuItem({ type: 'separator' }));
}

function addSleepy(menu) {
    const label = sleepy ? 'Gib Coffee' : 'Sooo eepy';
    menu.append(new MenuItem({
        label: label,
        click: () => {
            sleepy = !sleepy;
            store.set('sleepy', sleepy);
            sendSettingsToRenderer(); 
            updateFullMenu();
        }
    }));
    menu.append(new MenuItem({ type: 'separator' }));
}

function addAutolaunchMenuOptionCheckingSystem(menuToAppendTo) {
    autoLauncher.isEnabled().then((isEnabled) => {
        addAutolaunchMenuOption(isEnabled, menuToAppendTo);
        menuToAppendTo.append(new MenuItem({ type: 'separator' }));
        menuToAppendTo.append(new MenuItem({ label: 'Kill Sharkle :(', click: () => app.quit() }));
    });
}

function addAutolaunchMenuOption(isEnabled, menuToAppendTo) {
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
    menuToAppendTo.append(autolaunchItem);
}

populateMenuWithEverythingButTheAutolaunch(menu);
Menu.setApplicationMenu(menu);

ipcMain.on('mouse-down', (event, startCoords) => {
    if (startCoords.button === 2) {
        menu.popup({
            window: win,
            x: startCoords.x,
            y: startCoords.y
        });
    }
});

ipcMain.on('get-window-position', (event) => {
    if (win) {
        const [x, y] = win.getPosition();
        event.returnValue = { x, y };
    } else {
        event.returnValue = { x: 0, y: 0 };
    }
});

ipcMain.on('set-window-position', (event, newPos) => {
    if (win) {
        win.setBounds({
            x: newPos.x,
            y: newPos.y,
            width: currentWindowSize,
            height: currentWindowSize
        });
    }
});
