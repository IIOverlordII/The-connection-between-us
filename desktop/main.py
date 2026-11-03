"""Психопрофиль — отдельная программа для Windows.

Открывает приложение из папки app в собственном окне (движок Microsoft Edge WebView2).
Ответы хранятся в %APPDATA%\\Psy-Profile.
"""
import os
import sys

import webview


def resource(*parts):
    # inside the built .exe files are unpacked to sys._MEIPASS
    base = getattr(sys, '_MEIPASS', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    return os.path.join(base, *parts)


def main():
    storage = os.path.join(os.environ.get('APPDATA') or os.path.expanduser('~'), 'Psy-Profile')
    os.makedirs(storage, exist_ok=True)
    webview.create_window('Психопрофиль', url=resource('app', 'index.html'),
                          width=1180, height=860, min_size=(400, 600), background_color='#F5F3FB')
    webview.start(private_mode=False, storage_path=storage)


if __name__ == '__main__':
    main()
