import { useThemeColor } from '@/hooks/use-theme-color';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import MathView from './MathView';

interface MarkdownRendererProps {
    content: string;
    fontSize?: number;
    color?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
    content,
    fontSize = 18,
    color
}) => {
    const textColor = color || useThemeColor({}, 'text');
    const accentColor = useThemeColor({}, 'primary');
    const codeBg = useThemeColor({}, 'secondary');

    const styles = useMemo(() => ({
        body: {
            color: textColor,
            fontSize: fontSize,
        },
        code_inline: {
            backgroundColor: codeBg,
            color: accentColor,
            borderRadius: 4,
            paddingHorizontal: 4,
        },
        code_block: {
            backgroundColor: codeBg,
            color: textColor,
            borderRadius: 8,
            padding: 12,
            marginVertical: 8,
        },
        fence: {
            backgroundColor: codeBg,
            color: textColor,
            borderRadius: 8,
            padding: 12,
            marginVertical: 8,
        },
        link: {
            color: accentColor,
            textDecorationLine: 'underline',
        },
        strong: {
            fontWeight: 'bold',
        },
        em: {
            fontStyle: 'italic',
        },
        s: {
            backgroundColor: '#facc15',
            color: '#000',
            fontWeight: 'bold' as any,
            borderRadius: 4,
            paddingHorizontal: 2,
            textDecorationLine: 'none', // Remove strikethrough line
        },
        mark: {
            backgroundColor: '#facc15',
            color: '#000',
            fontWeight: 'bold' as any,
            borderRadius: 4,
            paddingHorizontal: 2,
        },
    }), [textColor, fontSize, codeBg, accentColor]);

    const rules = useMemo(() => ({
        s: (node: any, children: any, parent: any, styles: any) => (
            <Text key={node.key} style={styles.s}>
                {children}
            </Text>
        ),
    }), []);

    const renderContent = () => {
        // Pre-process highlight syntax ==text== and legacy <mark>text</mark> into ~~text~~ (strikethrough proxy)
        const processedContent = content
            .replace(/==([\s\S]+?)==/g, '~~$1~~')
            .replace(/<mark>([\s\S]+?)<\/mark>/g, '~~$1~~');

        if (!processedContent.includes('$')) {
            return (
                <Markdown style={styles as any} rules={rules}>
                    {processedContent}
                </Markdown>
            );
        }

        const parts = processedContent.split(/(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$)/g);

        return parts.map((part, index) => {
            if (part.startsWith('$$') && part.endsWith('$$')) {
                const math = part.slice(2, -2);
                return <MathView key={index} math={math} inline={false} color={textColor} fontSize={fontSize + 4} />;
            } else if (part.startsWith('$') && part.endsWith('$')) {
                const math = part.slice(1, -1);
                return <MathView key={index} math={math} inline={true} color={textColor} fontSize={fontSize} />;
            } else {
                return (
                    <Markdown key={index} style={styles as any} rules={rules}>
                        {part}
                    </Markdown>
                );
            }
        });
    };

    return (
        <View style={markdownStyles.container}>
            {renderContent()}
        </View>
    );
};

const markdownStyles = StyleSheet.create({
    container: {
        width: '100%',
    },
});

export default React.memo(MarkdownRenderer);
