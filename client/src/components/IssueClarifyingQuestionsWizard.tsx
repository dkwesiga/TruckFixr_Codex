import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";

export interface ClarifyingQuestion {
  question: string;
}

export interface ClarifyingAnswer {
  question: string;
  answer: string;
}

export interface IssueClarifyingQuestionsWizardProps {
  questions: ClarifyingQuestion[];
  isSubmitting: boolean;
  onSubmit: (answers: ClarifyingAnswer[]) => Promise<void>;
  onCancel: () => void;
}

export default function IssueClarifyingQuestionsWizard({
  questions,
  isSubmitting,
  onSubmit,
  onCancel,
}: IssueClarifyingQuestionsWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(
    questions.reduce((acc, _, i) => ({ ...acc, [i]: "" }), {})
  );
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState(false);

  const currentQuestion = questions[currentIndex];
  const isAnswered = answers[currentIndex]?.trim().length > 0;
  const allAnswered = questions.every((_, i) => answers[i]?.trim().length > 0);

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleAnswerChange = (text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentIndex]: text,
    }));
  };

  const handleSubmit = async () => {
    if (!allAnswered) return;

    setIsSubmittingAnswers(true);
    try {
      const submittedAnswers = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i],
      }));
      await onSubmit(submittedAnswers);
    } finally {
      setIsSubmittingAnswers(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
        <Stethoscope className="mt-0.5 h-5 w-5 text-blue-600 shrink-0" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold">One more detail to improve diagnosis</p>
          <p className="mt-1 text-blue-800">
            Answer {questions.length} quick question{questions.length === 1 ? "" : "s"} to help TruckFixr build confidence. Your answers will help your manager make the best decision.
          </p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Question {currentIndex + 1} of {questions.length}</CardTitle>
              <CardDescription className="mt-1">{currentQuestion.question}</CardDescription>
            </div>
            <div className="text-sm font-medium text-slate-600">
              {Math.round(((currentIndex + 1) / questions.length) * 100)}%
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Textarea
            value={answers[currentIndex] || ""}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Please provide a detailed answer..."
            className="min-h-24"
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {questions.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              index === currentIndex
                ? "bg-slate-900 text-white"
                : answers[index]?.trim().length > 0
                  ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {index + 1}
            {answers[index]?.trim().length > 0 && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
          </button>
        ))}
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0 || isSubmittingAnswers}
          className="rounded-xl"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmittingAnswers}
          className="rounded-xl"
        >
          Cancel
        </Button>
        {currentIndex < questions.length - 1 ? (
          <Button
            onClick={handleNext}
            disabled={!isAnswered || isSubmittingAnswers}
            className="fleet-primary-btn ml-auto rounded-xl"
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmittingAnswers}
            className="fleet-primary-btn ml-auto rounded-xl"
          >
            {isSubmittingAnswers ? "Submitting..." : "Submit Answers & Run Final Diagnosis"}
          </Button>
        )}
      </div>
    </div>
  );
}
