import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface MathViewProps {
    math: string;
    inline?: boolean;
    color?: string;
    fontSize?: number;
}

const MathView: React.FC<MathViewProps> = ({ math, inline = false, color = '#000', fontSize = 16 }) => {
    // Escape backslashes for JS string
    const escapedMath = math.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
        <style>
            body { 
                margin: 0; 
                padding: 0; 
                display: flex; 
                align-items: center; 
                justify-content: ${inline ? 'flex-start' : 'center'};
                background-color: transparent;
                color: ${color};
                font-size: ${fontSize}px;
            }
            #container {
                padding: 2px;
            }
        </style>
    </head>
    <body>
        <div id="container"></div>
        <script>
            try {
                katex.render('${escapedMath}', document.getElementById('container'), {
                    throwOnError: false,
                    displayMode: ${!inline}
                });
            } catch (e) {
                document.getElementById('container').innerText = '${escapedMath}';
            }
        </script>
    </body>
    </html>
    `;

    return (
        <View style={[
            styles.container,
            inline ? styles.inline : styles.block,
            { height: inline ? fontSize * 1.5 : fontSize * 3 }
        ]}>
            <WebView
                source={{ html }}
                scrollEnabled={false}
                overScrollMode="never"
                style={styles.webview}
                originWhitelist={['*']}
                scalesPageToFit={true}
                backgroundColor="transparent"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'transparent',
        overflow: 'hidden',
    },
    inline: {
        minWidth: 20,
    },
    block: {
        width: '100%',
        marginVertical: 8,
    },
    webview: {
        backgroundColor: 'transparent',
    }
});

export default MathView;
