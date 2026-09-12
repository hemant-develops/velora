import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';

export interface FAQItem {
  question: string;
  answer: string;
}

interface Props {
  items: FAQItem[];
}

// A plain expand/collapse list -- deliberately no LayoutAnimation/Animated
// API (per the "avoid unnecessary animation complexity" direction): each
// row just conditionally renders its own answer text, which React Native
// already animates smoothly enough for a single line of body copy, and
// keeps this cheap on lower-end Android devices. Single-open-at-a-time
// (an accordion, not independent toggles) keeps the section from growing
// too tall if someone opens everything.
export const FAQAccordion: React.FC<Props> = ({ items }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <View style={styles.card}>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <View key={item.question}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              style={styles.row}
              onPress={() => setOpenIndex((cur) => (cur === index ? null : index))}
              accessibilityRole="button"
              accessibilityLabel={item.question}
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={styles.question}>{item.question}</Text>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textTertiary}
              />
            </Pressable>
            {isOpen ? <Text style={styles.answer}>{item.answer}</Text> : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  question: { ...typography.bodyMd, color: colors.textPrimary, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  answer: { ...typography.bodySm, color: colors.textSecondary, lineHeight: 19, paddingBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border },
});
