import { fromDisplayText, toDisplayText } from '@/utils/CardText';
import React from 'react';
import { TextInputProps } from 'react-native';
import { Input } from './ui/Input';

// Card-side text input: the caller owns the raw card text (with ==highlight==
// markers and ![img](cardimg/…) tokens), but the user only ever sees and edits
// clean prose. Highlights on untouched words and attached images survive edits.
interface CardTextInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
    label?: string;
    value: string;
    onChangeText: (raw: string) => void;
}

export function CardTextInput({ value, onChangeText, ...props }: CardTextInputProps) {
    return (
        <Input
            {...props}
            value={toDisplayText(value)}
            onChangeText={(display) => onChangeText(fromDisplayText(value, display))}
        />
    );
}
